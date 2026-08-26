import { Injectable } from '@angular/core';
import {
  DEFAULT_BOARD,
  DEFAULT_THEME,
  ENVELOPE_KEY,
  LEGACY_KEYS,
  StorageEnvelope,
} from '../models/envelope.model';
import { base64ToBytes, bytesToBase64, minifyJson } from '../utils/bytes.util';

@Injectable({ providedIn: 'root' })
export class ChromeStorageService {
  private envelope: StorageEnvelope = { v: 2 };
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs = 400;

  async init(): Promise<StorageEnvelope> {
    const stored = await chrome.storage.local.get([ENVELOPE_KEY]);
    const raw = stored[ENVELOPE_KEY];
    if (typeof raw === 'string' && raw) {
      try {
        this.envelope = JSON.parse(raw) as StorageEnvelope;
        if (this.envelope.v !== 2) this.envelope = { v: 2 };
        return this.envelope;
      } catch {
        /* fall through to migration */
      }
    }
    await this.migrateFromLegacy();
    await this.flush();
    return this.envelope;
  }

  getEnvelope(): StorageEnvelope {
    return { ...this.envelope };
  }

  patch(partial: Partial<StorageEnvelope>): void {
    this.envelope = { ...this.envelope, ...partial, v: 2 };
    this.schedulePersist();
  }

  setDbBytes(bytes: Uint8Array): void {
    this.envelope.db = bytesToBase64(bytes);
    this.schedulePersist();
  }

  getDbBytes(): Uint8Array | null {
    const b64 = this.envelope.db;
    if (typeof b64 !== 'string' || !b64) return null;
    try {
      return base64ToBytes(b64);
    } catch {
      return null;
    }
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await chrome.storage.local.set({ [ENVELOPE_KEY]: minifyJson(this.envelope) });
  }

  schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flush();
    }, this.debounceMs);
  }

  /** Idempotent migration from legacy *_v1 keys */
  async migrateFromLegacy(): Promise<void> {
    const keys = Object.values(LEGACY_KEYS);
    const legacy = await chrome.storage.local.get(keys);
    const hasLegacy = keys.some((k) => legacy[k] != null);
    if (!hasLegacy && this.envelope.db) return;

    const next: StorageEnvelope = { ...this.envelope, v: 2 };

    if (typeof legacy[LEGACY_KEYS.db] === 'string') {
      next.db = legacy[LEGACY_KEYS.db] as string;
    }
    if (typeof legacy[LEGACY_KEYS.theme] === 'string') {
      next.t = legacy[LEGACY_KEYS.theme] as string;
    } else if (!next.t) {
      next.t = DEFAULT_THEME;
    }
    if (typeof legacy[LEGACY_KEYS.board] === 'string') {
      next.b = legacy[LEGACY_KEYS.board] as string;
    } else if (!next.b) {
      next.b = DEFAULT_BOARD;
    }
    if (legacy[LEGACY_KEYS.keyLayout] === 'qwerty' || legacy[LEGACY_KEYS.keyLayout] === 'dvorak') {
      next.kl = legacy[LEGACY_KEYS.keyLayout] as 'qwerty' | 'dvorak';
    }
    if (legacy[LEGACY_KEYS.keyboardNav] === 'mac' || legacy[LEGACY_KEYS.keyboardNav] === 'winlinux') {
      next.knp = legacy[LEGACY_KEYS.keyboardNav] as 'mac' | 'winlinux';
    }
    if (typeof legacy[LEGACY_KEYS.customBg] === 'string') {
      next.bg = legacy[LEGACY_KEYS.customBg] as string;
    }
    const aiUrl = legacy[LEGACY_KEYS.aiUrl];
    const aiWords = legacy[LEGACY_KEYS.aiWords];
    if (typeof aiUrl === 'string' || Array.isArray(aiWords)) {
      next.ai = {
        u: typeof aiUrl === 'string' ? aiUrl : '',
        w: Array.isArray(aiWords) ? aiWords.join('\n') : '',
      };
    }

    this.envelope = next;
    if (hasLegacy) {
      await chrome.storage.local.remove(keys);
    }
  }
}

/** Pure helpers for unit tests */
export function serializeEnvelope(envelope: StorageEnvelope): string {
  return minifyJson(envelope);
}

export function deserializeEnvelope(raw: string): StorageEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as StorageEnvelope;
    return parsed?.v === 2 ? parsed : null;
  } catch {
    return null;
  }
}

export function buildEnvelopeFromLegacy(legacy: Record<string, unknown>): StorageEnvelope {
  const env: StorageEnvelope = { v: 2, t: DEFAULT_THEME, b: DEFAULT_BOARD };
  if (typeof legacy[LEGACY_KEYS.db] === 'string') env.db = legacy[LEGACY_KEYS.db] as string;
  if (typeof legacy[LEGACY_KEYS.theme] === 'string') env.t = legacy[LEGACY_KEYS.theme] as string;
  if (typeof legacy[LEGACY_KEYS.board] === 'string') env.b = legacy[LEGACY_KEYS.board] as string;
  if (legacy[LEGACY_KEYS.keyLayout] === 'qwerty' || legacy[LEGACY_KEYS.keyLayout] === 'dvorak') {
    env.kl = legacy[LEGACY_KEYS.keyLayout] as 'qwerty' | 'dvorak';
  }
  return env;
}
