import { Injectable, inject, signal } from '@angular/core';
import { ChromeStorageService } from './chrome-storage.service';

/** Obsidian vault sync — uses existing pick-vault/grant pages and IndexedDB handle storage. */
@Injectable({ providedIn: 'root' })
export class ObsidianService {
  private readonly storage = inject(ChromeStorageService);
  readonly vaultName = signal('');
  readonly notesFolder = signal('');
  readonly syncMode = signal(false);

  loadFromEnvelope(): void {
    const obs = this.storage.getEnvelope().obs;
    this.vaultName.set(obs?.v ?? '');
    this.notesFolder.set(obs?.f ?? '');
    this.syncMode.set(!!obs?.s);
  }

  openObsidianUrl(url: string): void {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url });
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.click();
  }

  buildOpenUrl(vault: string, relPath: string): string {
    const file = relPath.replace(/\\/g, '/');
    return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;
  }

  clearFirstOpenCache(): void {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('obsidianPathCreated_v1:'));
    for (const k of keys) localStorage.removeItem(k);
  }
}
