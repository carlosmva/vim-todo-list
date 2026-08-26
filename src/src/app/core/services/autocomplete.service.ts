import { Injectable, inject } from '@angular/core';
import { BackgroundBridgeService } from './background-bridge.service';
import { ChromeStorageService } from './chrome-storage.service';

@Injectable({ providedIn: 'root' })
export class AutocompleteService {
  private readonly bg = inject(BackgroundBridgeService);
  private readonly storage = inject(ChromeStorageService);

  async fetchOllamaSuggestion(prefix: string, context: string): Promise<string[]> {
    const env = this.storage.getEnvelope();
    const base = env.ai?.u?.trim();
    if (!base || !prefix.trim()) return [];
    const model = env.ai?.m?.trim() || '';
    const url = new URL('/api/generate', base.endsWith('/') ? base : `${base}/`).toString();
    const res = await this.bg.ollamaFetch(url, 'POST', {
      model: model || undefined,
      prompt: `${context}\nComplete: ${prefix}`,
      stream: false,
    });
    if (!res.ok || !res.data || typeof res.data !== 'object') return [];
    const text = String((res.data as { response?: string }).response || '').trim();
    return text ? [text] : [];
  }
}
