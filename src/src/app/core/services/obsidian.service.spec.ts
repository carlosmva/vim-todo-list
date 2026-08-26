import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Note } from '../models/note.model';
import { ChromeStorageService } from './chrome-storage.service';
import { DatabaseService } from './database.service';
import { NotesRepository } from './notes.repository';
import { ObsidianService } from './obsidian.service';

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 7,
    text: 'Title',
    status: 'pending',
    priority: 'normal',
    created_at: 1,
    updated_at: 1,
    completed_at: null,
    notes_html: '',
    sort_order: 0,
    board: 'Work',
    due_at: null,
    ...overrides,
  };
}

function failingVaultRoot() {
  return {
    name: 'Vault',
    queryPermission: async () => 'granted' as const,
    requestPermission: async () => 'granted' as const,
    getDirectoryHandle: async () => {
      throw new Error('missing');
    },
    getFileHandle: async () => {
      throw new Error('missing');
    },
    async *entries() {
      return;
    },
  };
}

describe('ObsidianService navigateToNote', () => {
  const card = note();

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ObsidianService,
        {
          provide: ChromeStorageService,
          useValue: { getEnvelope: () => ({ obs: { v: 'Vault', f: 'ToDo', s: true } }) },
        },
        {
          provide: DatabaseService,
          useValue: {
            getSetting: (key: string) => {
              if (key === 'obsidian.vaultName') return 'Vault';
              if (key === 'obsidian.notesFolder') return 'ToDo';
              if (key === 'obsidian.syncMode') return '1';
              return null;
            },
            persist: async () => undefined,
          },
        },
        {
          provide: NotesRepository,
          useValue: {
            queryNote: () => card,
            queryNotes: () => [card],
            updateNoteUpdatedAt: () => undefined,
          },
        },
      ],
    });
  });

  it('does not emit obsidian://new when Sync-mode lookup/write fails', async () => {
    const root = failingVaultRoot();
    (window as Window & { ObsidianVaultIdb?: { loadVaultHandle: () => Promise<typeof root> } }).ObsidianVaultIdb = {
      loadVaultHandle: async () => root,
    };
    const service = TestBed.inject(ObsidianService);
    const opened: string[] = [];
    vi.spyOn(service, 'openObsidianUrl').mockImplementation(async (url: string) => {
      opened.push(url);
    });

    const result = await service.navigateToNote(7);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.code).toBe('write-failed');
    expect(opened.some((url) => url.startsWith('obsidian://new'))).toBe(false);
    expect(opened).toEqual([]);
  });
});
