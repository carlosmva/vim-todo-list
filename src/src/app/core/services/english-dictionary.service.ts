import { Injectable, inject } from '@angular/core';
import { BackgroundBridgeService } from './background-bridge.service';

const DICT_CACHE_KEY = 'englishDict:5000-words:v1';
const DICT_URL = 'https://raw.githubusercontent.com/mahsu/IndexingExercise/master/5000-words.txt';

@Injectable({ providedIn: 'root' })
export class EnglishDictionaryService {
  private readonly bg = inject(BackgroundBridgeService);
  private words: string[] | null = null;
  private loadPromise: Promise<string[]> | null = null;

  ensureLoaded(): Promise<string[]> {
    if (this.words) return Promise.resolve(this.words);
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        let txt = '';
        try {
          const cached = await chrome.storage.local.get(DICT_CACHE_KEY);
          txt = typeof cached?.[DICT_CACHE_KEY] === 'string' ? cached[DICT_CACHE_KEY] : '';
        } catch {
          // ignore
        }

        if (!txt) {
          const res = await this.bg.ollamaFetch(DICT_URL, 'GET', undefined, 30000);
          if (!res.ok) throw new Error(`Dictionary fetch failed: ${res.status ?? res.error ?? 'unknown'}`);
          txt = typeof res.text === 'string' ? res.text : '';
          if (!txt && res.data != null) txt = String(res.data);
          try {
            await chrome.storage.local.set({ [DICT_CACHE_KEY]: txt });
          } catch {
            // ignore
          }
        }

        const out: string[] = [];
        const seen = new Set<string>();
        for (const line of txt.split(/\r?\n/)) {
          const w = String(line || '').trim();
          if (!w || w.length > 60) continue;
          if (!/^[A-Za-z]+(?:[-'][A-Za-z]+)*$/.test(w)) continue;
          const lower = w.toLowerCase();
          if (seen.has(lower)) continue;
          seen.add(lower);
          out.push(lower);
        }
        out.sort();
        this.words = out;
        return out;
      } finally {
        if (!this.words) this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  hasWordLower(wordLower: string): boolean {
    const words = this.words;
    const w = String(wordLower || '');
    if (!words?.length || !w) return false;
    let lo = 0;
    let hi = words.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (words[mid] < w) lo = mid + 1;
      else hi = mid;
    }
    return words[lo] === w;
  }

  isGluedDictWordsLower(wordLower: string): boolean {
    const w = String(wordLower || '');
    const words = this.words;
    if (!w || w.length < 10 || !/^[a-z]+$/.test(w) || !words?.length) return false;
    for (let i = 4; i <= w.length - 4; i++) {
      const a = w.slice(0, i);
      const b = w.slice(i);
      if (this.hasWordLower(a) && this.hasWordLower(b)) return true;
    }
    return false;
  }
}
