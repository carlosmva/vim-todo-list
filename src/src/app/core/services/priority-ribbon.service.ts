import { Injectable, inject, signal } from '@angular/core';
import { ChromeStorageService } from './chrome-storage.service';
import { DatabaseService } from './database.service';
import { NotesRepository } from './notes.repository';
import {
  PriorityRibbonLimit,
  PriorityRibbonNote,
} from '../models/priority-ribbon.model';
import {
  AI_PRIORITY_RIBBON_ENABLED_KEY,
  AI_PRIORITY_RIBBON_LIMIT_KEY,
  readPriorityRibbonSettings,
} from '../utils/ai-settings.util';
import { DEFAULT_PRIORITY_RIBBON_LIMIT } from '../models/priority-ribbon.model';

export const PRIORITY_RIBBON_ENABLED_KEY = AI_PRIORITY_RIBBON_ENABLED_KEY;
export const PRIORITY_RIBBON_LIMIT_KEY = AI_PRIORITY_RIBBON_LIMIT_KEY;

@Injectable({ providedIn: 'root' })
export class PriorityRibbonService {
  private readonly storage = inject(ChromeStorageService);
  private readonly dbService = inject(DatabaseService);
  private readonly repo = inject(NotesRepository);

  readonly enabled = signal(false);
  readonly limit = signal<PriorityRibbonLimit>(DEFAULT_PRIORITY_RIBBON_LIMIT);
  readonly items = signal<PriorityRibbonNote[]>([]);

  loadSettings(): void {
    const { enabled, limit } = readPriorityRibbonSettings(
      (key) => this.dbService.getSetting(key),
      this.storage.getEnvelope().ai
    );
    this.limit.set(limit);
    if (enabled) {
      const next = this.repo.queryPriorityRibbonNotes(limit);
      if (!sameRibbonItems(this.items(), next)) this.items.set(next);
    } else if (this.items().length) {
      this.items.set([]);
    }
    this.enabled.set(enabled);
  }

  refreshItems(): void {
    if (!this.enabled()) {
      if (this.items().length) this.items.set([]);
      return;
    }
    const next = this.repo.queryPriorityRibbonNotes(this.limit());
    if (sameRibbonItems(this.items(), next)) return;
    this.items.set(next);
  }

  saveSettings(enabled: boolean, limit: PriorityRibbonLimit): void {
    this.enabled.set(enabled);
    this.limit.set(limit);
    this.dbService.setSetting(PRIORITY_RIBBON_ENABLED_KEY, enabled ? '1' : '0');
    this.dbService.setSetting(PRIORITY_RIBBON_LIMIT_KEY, String(limit));

    const env = this.storage.getEnvelope();
    this.storage.patch({
      ai: {
        ...env.ai,
        pr: enabled,
        prl: limit,
      },
    });

    this.refreshItems();
  }
}

function sameRibbonItems(current: PriorityRibbonNote[], next: PriorityRibbonNote[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((item, index) => {
    const other = next[index];
    return (
      item.id === other.id &&
      item.text === other.text &&
      item.board === other.board &&
      item.priority === other.priority &&
      item.due_at === other.due_at
    );
  });
}
