import { Injectable, inject } from '@angular/core';
import { BackgroundBridgeService } from './background-bridge.service';
import { ChromeStorageService } from './chrome-storage.service';
import { DatabaseService } from './database.service';
import { EnglishDictionaryService } from './english-dictionary.service';
import { NotesRepository } from './notes.repository';
import {
  buildAiAutocompletePrompt,
  CompletionCandidate,
  findCustomWordCompletion,
  normalizeAiCompletion,
  parseCustomWords,
  pickShorterCompletion,
} from '../utils/autocomplete.util';

export interface AiConfig {
  baseUrl: string;
  model: string;
  customWords: string[];
}

@Injectable({ providedIn: 'root' })
export class AutocompleteService {
  private readonly bg = inject(BackgroundBridgeService);
  private readonly storage = inject(ChromeStorageService);
  private readonly dbService = inject(DatabaseService);
  private readonly dict = inject(EnglishDictionaryService);
  private readonly repo = inject(NotesRepository);

  getAiConfig(): AiConfig {
    const env = this.storage.getEnvelope();
    const baseUrl = (this.dbService.getSetting('ai.endpointBaseUrl') ?? env.ai?.u ?? '').trim();
    const model = (this.dbService.getSetting('ai.endpointModel') ?? env.ai?.m ?? '').trim();
    const wordsJson = this.dbService.getSetting('ai.customWordsJson');
    let customWords = parseCustomWords(wordsJson);
    if (!customWords.length && env.ai?.w) customWords = parseCustomWords(env.ai.w);
    return { baseUrl, model, customWords };
  }

  queryLocalSuggestions(query: string, limit = 6): string[] {
    try {
      return this.repo.queryLocalTextSuggestions(query, limit);
    } catch {
      return [];
    }
  }

  queryLocalCompletion(baseText: string): CompletionCandidate | null {
    const config = this.getAiConfig();
    try {
      const dbCompletion = this.repo.queryBestLocalWordCompletion(baseText);
      const customCompletion = findCustomWordCompletion(baseText, config.customWords);
      const picked = pickShorterCompletion(
        dbCompletion ? { ...dbCompletion, kind: 'local' } : null,
        customCompletion
      );
      return picked;
    } catch {
      return findCustomWordCompletion(baseText, config.customWords);
    }
  }

  async fetchAiCompletion(prefixText: string, signal?: AbortSignal): Promise<CompletionCandidate | null> {
    const { baseUrl, model: modelOverride, customWords } = this.getAiConfig();
    if (!baseUrl || !String(prefixText || '').trim()) return null;

    const prompt = buildAiAutocompletePrompt(prefixText, customWords);
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const generateUrl = new URL('api/generate', base).toString();
    const chatUrl = new URL('api/chat', base).toString();

    let model = modelOverride;
    if (!model) {
      model = await this.fetchDefaultModel(base, signal);
      if (!model) return null;
    }

    const raw =
      (await this.tryGenerate(generateUrl, model, prompt, signal)) ||
      (await this.tryGenerate(generateUrl, model, `${prompt}\n\nIMPORTANT: Output at least 1 visible character. If mid-word, output the missing suffix only.`, signal)) ||
      (await this.tryChat(chatUrl, model, prompt, signal));

    if (!raw) return null;

    try {
      await this.dict.ensureLoaded();
    } catch {
      // Dictionary is optional; normalization still works without it.
    }

    return normalizeAiCompletion(prefixText, raw, {
      customWords,
      dictHasWordLower: (wordLower) => this.dict.hasWordLower(wordLower),
      isGluedDictWordsLower: (wordLower) => this.dict.isGluedDictWordsLower(wordLower),
    });
  }

  private async fetchDefaultModel(baseUrl: string, signal?: AbortSignal): Promise<string> {
    const url = new URL('api/tags', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
    const res = await this.fetchWithAbort(url, 'GET', undefined, signal, 15000);
    if (!res.ok || !res.data || typeof res.data !== 'object') return '';
    const models = (res.data as { models?: Array<{ name?: string }> }).models;
    const name = models?.[0]?.name;
    return typeof name === 'string' ? name : '';
  }

  private async tryGenerate(url: string, model: string, prompt: string, signal?: AbortSignal): Promise<string> {
    const res = await this.fetchWithAbort(
      url,
      'POST',
      { model, prompt: String(prompt || ''), stream: false, options: { num_predict: 48, temperature: 0.4, top_p: 0.95 } },
      signal,
      45000
    );
    if (!res.ok || !res.data || typeof res.data !== 'object') return '';
    return String((res.data as { response?: string }).response || '').trim();
  }

  private async tryChat(url: string, model: string, prompt: string, signal?: AbortSignal): Promise<string> {
    const res = await this.fetchWithAbort(
      url,
      'POST',
      {
        model,
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              'You are an autocomplete engine. Return only the continuation text to insert at the cursor. No quotes. One line.',
          },
          { role: 'user', content: String(prompt || '') },
        ],
        options: { num_predict: 48, temperature: 0.4, top_p: 0.95 },
      },
      signal,
      45000
    );
    if (!res.ok || !res.data || typeof res.data !== 'object') return '';
    const data = res.data as { message?: { content?: string } };
    return String(data.message?.content || '').trim();
  }

  private fetchWithAbort(
    url: string,
    method: string,
    body: unknown,
    signal?: AbortSignal,
    timeoutMs = 45000
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    if (signal?.aborted) return Promise.resolve({ ok: false, error: 'aborted' });
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: { ok: boolean; data?: unknown; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const onAbort = () => finish({ ok: false, error: 'aborted' });
      signal?.addEventListener('abort', onAbort, { once: true });
      void this.bg.ollamaFetch(url, method, body, timeoutMs).then((res) => {
        signal?.removeEventListener('abort', onAbort);
        finish(res);
      });
    });
  }
}
