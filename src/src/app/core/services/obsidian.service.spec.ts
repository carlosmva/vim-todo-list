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

class MockFile {
  kind = 'file' as const;
  writes = 0;
  constructor(
    public name: string,
    public content: string,
    public lastModified = 10
  ) {}
  async getFile(): Promise<File> {
    return new File([this.content], this.name, { lastModified: this.lastModified });
  }
  async createWritable() {
    this.writes += 1;
    return {
      write: async (next: string) => {
        this.content = next;
      },
      close: async () => undefined,
    };
  }
}

class MockDir {
  kind = 'directory' as const;
  constructor(
    public name: string,
    readonly children = new Map<string, MockDir | MockFile>()
  ) {}

  async queryPermission(): Promise<'granted' | 'denied'> {
    return 'granted';
  }
  async requestPermission(): Promise<'granted' | 'denied'> {
    return 'granted';
  }
  async getDirectoryHandle(name: string, options: { create: boolean }) {
    const hit = this.children.get(name);
    if (hit instanceof MockDir) return hit;
    if (!options.create) throw new Error('missing directory');
    const dir = new MockDir(name);
    this.children.set(name, dir);
    return dir;
  }
  async getFileHandle(name: string, options: { create: boolean }) {
    const hit = this.children.get(name);
    if (hit instanceof MockFile) return hit;
    if (!options.create) throw new Error('missing file');
    const file = new MockFile(name, '');
    this.children.set(name, file);
    return file;
  }
  async removeEntry(name: string) {
    if (!this.children.delete(name)) throw new Error('missing entry');
  }
  async *entries() {
    yield* this.children.entries();
  }
}

function vaultMd(id: number, title: string, board = 'Work', extra = ''): string {
  return `# ${title}\n\n${extra}---\n*Board: ${board} · Vim To-Do (id ${id})*\n#vim-todo/pending`;
}

function importVault(files: Record<string, { name: string; content: string }>) {
  const work = new MockDir('Work', new Map(Object.entries(files).map(([path, file]) => [file.name, new MockFile(file.name, file.content)])));
  const todo = new MockDir('ToDo', new Map([['Work', work]]));
  return new MockDir('Vault', new Map([['ToDo', todo]]));
}

describe('ObsidianService compare and import', () => {
  const notes = new Map<number, Note>();
  const boards = new Set<string>(['Work']);
  let persistCalls = 0;
  let syncMode = '1';

  function configure(root: MockDir | null, permission: 'granted' | 'denied' = 'granted') {
    TestBed.resetTestingModule();
    persistCalls = 0;
    TestBed.configureTestingModule({
      providers: [
        ObsidianService,
        {
          provide: ChromeStorageService,
          useValue: { getEnvelope: () => ({ obs: { v: 'Vault', f: 'ToDo', s: syncMode === '1' } }) },
        },
        {
          provide: DatabaseService,
          useValue: {
            getSetting: (key: string) => {
              if (key === 'obsidian.vaultName') return 'Vault';
              if (key === 'obsidian.notesFolder') return 'ToDo';
              if (key === 'obsidian.syncMode') return syncMode;
              return null;
            },
            persist: async () => {
              persistCalls += 1;
            },
          },
        },
        {
          provide: NotesRepository,
          useValue: {
            queryNote: (id: number) => notes.get(id) ?? null,
            queryNotes: () => [...notes.values()],
            queryBoards: () => [...boards],
            addBoard: (name: string) => {
              boards.add(name);
              return true;
            },
            insertNoteWithId: (input: { id: number; board: string; text: string; notes_html?: string; status?: Note['status']; due_at?: number | null; priority?: Note['priority'] | null }) => {
              if (notes.has(input.id)) return false;
              boards.add(input.board || 'Work');
              notes.set(input.id, note({
                id: input.id,
                board: input.board,
                text: input.text,
                notes_html: input.notes_html ?? '',
                status: input.status ?? 'pending',
                due_at: input.due_at ?? null,
                priority: input.priority ?? 'normal',
              }));
              return true;
            },
            updateNoteUpdatedAt: (id: number, updatedAt: number) => {
              const current = notes.get(id);
              if (current) notes.set(id, { ...current, updated_at: updatedAt });
            },
            updateNoteFromVault: (
              id: number,
              text: string,
              notesHtml: string,
              updatedAt: number,
              fields?: { due_at?: number | null; status?: Note['status']; board?: string; priority?: Note['priority'] | null }
            ) => {
              const current = notes.get(id);
              if (!current) return;
              notes.set(id, {
                ...current,
                text,
                notes_html: notesHtml,
                updated_at: updatedAt,
                due_at: fields && 'due_at' in fields ? fields.due_at ?? null : current.due_at,
                status: fields?.status ?? current.status,
                board: fields?.board || current.board,
                priority: fields?.priority ?? current.priority,
              });
            },
          },
        },
      ],
    });
    if (root) {
      root.queryPermission = async () => permission;
      root.requestPermission = async () => permission;
    }
    (window as Window & { ObsidianVaultIdb?: { loadVaultHandle: () => Promise<MockDir | null> } }).ObsidianVaultIdb =
      { loadVaultHandle: async () => root };
  }

  beforeEach(() => {
    notes.clear();
    boards.clear();
    boards.add('Work');
    syncMode = '1';
    localStorage.clear();
    (globalThis as unknown as { chrome: { storage: { local: { get: () => Promise<Record<string, unknown>>; set: () => Promise<void> } } } }).chrome = {
      storage: {
        local: {
          get: async () => ({}),
          set: async () => undefined,
        },
      },
    };
  });

  it('returns no-folder without inserting when the vault handle is missing', async () => {
    configure(null);
    const service = TestBed.inject(ObsidianService);
    const result = await service.compareVaultNotes();
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.code).toBe('no-folder');
    expect(notes.size).toBe(0);
  });

  it('returns permission-denied without inserting when access is denied', async () => {
    const root = importVault({
      'Title.md': { name: 'Title.md', content: vaultMd(42, 'Missing') },
    });
    configure(root, 'denied');
    const service = TestBed.inject(ObsidianService);
    const result = await service.compareVaultNotes();
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('permission-denied');
      expect(result.message).toContain('second Allow');
      expect(result.message).toContain('not the ToDo notes folder');
    }
    expect(notes.size).toBe(0);
  });

  it('buckets missing, already-present, and ignored files without inserting on compare', async () => {
    notes.set(7, note());
    const work = new MockDir(
      'Work',
      new Map([
        ['Title.md', new MockFile('Title.md', vaultMd(7, 'Title'))],
        ['New.md', new MockFile('New.md', vaultMd(42, 'Vault only', 'Archive'))],
        ['Orphan.md', new MockFile('Orphan.md', '# Native\n\nNo footer.')],
      ])
    );
    const root = new MockDir('Vault', new Map([['ToDo', new MockDir('ToDo', new Map([['Work', work]]))]]));
    configure(root);
    const service = TestBed.inject(ObsidianService);
    const result = await service.compareVaultNotes();
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.compare.missing.map((item) => item.id)).toEqual([42]);
    expect(result.compare.present.map((item) => item.id)).toEqual([7]);
    expect(result.compare.ignoredCount).toBe(1);
    expect(notes.has(42)).toBe(false);
  });

  it('imports only missing ids, remembers paths, and does not rewrite vault files', async () => {
    notes.set(7, note());
    const existing = new MockFile('Title.md', vaultMd(7, 'Title'));
    const missing = new MockFile(
      'New.md',
      '# Vault only\n\n**Due:** Jan 1, 2026\n\nBody\n\n---\n*Board: Archive · Vim To-Do (id 42)*\n#vim-todo/complete'
    );
    const numbered = new MockFile('Title 1.md', vaultMd(7, 'Title'));
    const work = new MockDir('Work', new Map([
      ['Title.md', existing],
      ['Title 1.md', numbered],
      ['New.md', missing],
    ]));
    const root = new MockDir('Vault', new Map([['ToDo', new MockDir('ToDo', new Map([['Work', work]]))]]));
    configure(root);
    const service = TestBed.inject(ObsidianService);
    const compared = await service.compareVaultNotes();
    expect(compared.kind).toBe('ok');
    if (compared.kind !== 'ok') return;
    const imported = await service.importMissingVaultNotes(compared.compare);
    expect(imported).toEqual({ kind: 'ok', imported: 1, skipped: 1, ignored: 0 });
    expect(notes.get(42)?.text).toBe('Vault only');
    expect(notes.get(42)?.board).toBe('Archive');
    expect(notes.get(42)?.status).toBe('complete');
    expect(notes.get(42)?.due_at).toBe(Date.UTC(2026, 0, 1));
    expect(notes.get(7)?.text).toBe('Title');
    expect(existing.writes).toBe(0);
    expect(missing.writes).toBe(0);
    expect(numbered.writes).toBe(0);
    expect(await service.rememberedVaultPath(7)).toBe('ToDo/Work/Title.md');
    expect(await service.rememberedVaultPath(42)).toBe('ToDo/Work/New.md');
    expect(persistCalls).toBe(1);
  });

  it('does not insert a second note when Title.md and Title 1.md share an id', async () => {
    const work = new MockDir(
      'Work',
      new Map([
        ['Title.md', new MockFile('Title.md', vaultMd(7, 'Title'))],
        ['Title 1.md', new MockFile('Title 1.md', vaultMd(7, 'Title'))],
      ])
    );
    const root = new MockDir('Vault', new Map([['ToDo', new MockDir('ToDo', new Map([['Work', work]]))]]));
    configure(root);
    const service = TestBed.inject(ObsidianService);
    const compared = await service.compareVaultNotes();
    expect(compared.kind).toBe('ok');
    if (compared.kind !== 'ok') return;
    expect(compared.compare.missing).toHaveLength(1);
    await service.importMissingVaultNotes(compared.compare);
    expect([...notes.keys()]).toEqual([7]);
    expect(await service.rememberedVaultPath(7)).toBe('ToDo/Work/Title.md');
  });

  it('counts a differing already-present id and does not open a conflict result', async () => {
    notes.set(7, note({ notes_html: 'card side' }));
    const work = new MockDir(
      'Work',
      new Map([['Title.md', new MockFile('Title.md', vaultMd(7, 'Title', 'Work', 'vault side\n\n'))]])
    );
    const root = new MockDir('Vault', new Map([['ToDo', new MockDir('ToDo', new Map([['Work', work]]))]]));
    configure(root);
    const service = TestBed.inject(ObsidianService);
    const compared = await service.compareVaultNotes();
    expect(compared.kind).toBe('ok');
    if (compared.kind !== 'ok') return;
    expect(compared.compare.present[0]?.differs).toBe(true);
    const imported = await service.importMissingVaultNotes(compared.compare);
    expect(imported.kind).toBe('ok');
    expect(notes.get(7)?.notes_html).toBe('card side');
  });

  it('deletes the board folder under the notes directory and leaves ToDo', async () => {
    const work = new MockDir('Work', new Map([['Title.md', new MockFile('Title.md', vaultMd(7, 'Title'))]]));
    const todo = new MockDir('ToDo', new Map([['Work', work]]));
    const root = new MockDir('Vault', new Map([['ToDo', todo]]));
    configure(root);
    const service = TestBed.inject(ObsidianService);
    const result = await service.deleteBoardFolder('Work');
    expect(result.kind).toBe('ok');
    expect(todo.children.has('Work')).toBe(false);
    expect(root.children.has('ToDo')).toBe(true);
  });

  it('does not conflict when the vault only added a matching properties block', async () => {
    notes.set(7, note());
    const withProps = [
      '---',
      'tags:',
      '  - inbox',
      '---',
      '',
      vaultMd(7, 'Title'),
    ].join('\n');
    const work = new MockDir('Work', new Map([['Title.md', new MockFile('Title.md', withProps)]]));
    const root = new MockDir('Vault', new Map([['ToDo', new MockDir('ToDo', new Map([['Work', work]]))]]));
    configure(root);
    const service = TestBed.inject(ObsidianService);
    const compared = await service.compareVaultNotes();
    expect(compared.kind).toBe('ok');
    if (compared.kind !== 'ok') return;
    expect(compared.compare.present[0]?.differs).toBe(false);
    const synced = await service.syncWithVault(7);
    expect(synced.kind).toBe('ok');
  });

  it('keeps unknown properties when keep-card writes the vault file', async () => {
    notes.set(7, note({ notes_html: 'card side' }));
    const existing = new MockFile(
      'Title.md',
      [
        '---',
        'tags:',
        '  - project',
        'aliases:',
        '  - Old',
        '---',
        '',
        vaultMd(7, 'Title', 'Work', 'vault side\n\n'),
      ].join('\n')
    );
    const work = new MockDir('Work', new Map([['Title.md', existing]]));
    const root = new MockDir('Vault', new Map([['ToDo', new MockDir('ToDo', new Map([['Work', work]]))]]));
    configure(root);
    const service = TestBed.inject(ObsidianService);
    const synced = await service.syncWithVault(7);
    expect(synced.kind).toBe('conflict');
    if (synced.kind !== 'conflict') return;
    expect(synced.conflict.appMarkdown).not.toContain('tags:');
    expect(synced.conflict.vaultMarkdown).not.toContain('tags:');
    const resolved = await service.resolveConflict(synced.conflict, 'app');
    expect(resolved.kind).toBe('ok');
    expect(existing.content).toContain('tags:');
    expect(existing.content).toContain('project');
    expect(existing.content).toContain('aliases:');
    expect(existing.content).toContain('card side');
    expect(existing.content).not.toContain('vault side');
  });
});
