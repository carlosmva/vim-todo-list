import { describe, expect, it } from 'vitest';
import type { Note } from '../models/note.model';
import {
  findVaultNoteFile,
  pickCanonicalVaultFile,
  type VaultDirectoryHandle,
  type VaultFileHandle,
  type VaultNoteFile,
} from './obsidian-vault-scan.util';

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

function md(id: number, title = 'Title'): string {
  return `# ${title}\n\n---\n*Board: Work · Vim To-Do (id ${id})*\n#vim-todo/pending`;
}

class MockFile implements VaultFileHandle {
  kind = 'file' as const;
  constructor(
    public name: string,
    public content: string,
    public lastModified = 10
  ) {}
  async getFile(): Promise<File> {
    return new File([this.content], this.name, { lastModified: this.lastModified });
  }
}

class MockDir implements VaultDirectoryHandle {
  kind = 'directory' as const;
  constructor(
    public name: string,
    readonly children = new Map<string, MockDir | MockFile>()
  ) {}

  async getDirectoryHandle(name: string, options: { create: boolean }): Promise<VaultDirectoryHandle> {
    const hit = this.lookupDir(name);
    if (hit) return hit;
    if (!options.create) throw new Error('missing directory');
    const dir = new MockDir(name);
    this.children.set(name, dir);
    return dir;
  }

  async getFileHandle(name: string, options: { create: boolean }): Promise<VaultFileHandle> {
    const hit = this.lookupFile(name);
    if (hit) return hit;
    if (!options.create) throw new Error('missing file');
    const file = new MockFile(name, '');
    this.children.set(name, file);
    return file;
  }

  async *entries(): AsyncIterableIterator<[string, VaultFileHandle | VaultDirectoryHandle]> {
    yield* this.children.entries();
  }

  private lookupDir(name: string): MockDir | undefined {
    const exact = this.children.get(name);
    if (exact instanceof MockDir) return exact;
    for (const [entryName, handle] of this.children) {
      if (entryName.toLowerCase() === name.toLowerCase() && handle instanceof MockDir) return handle;
    }
    return undefined;
  }

  private lookupFile(name: string): MockFile | undefined {
    const exact = this.children.get(name);
    if (exact instanceof MockFile) return exact;
    for (const [entryName, handle] of this.children) {
      if (entryName.toLowerCase() === name.toLowerCase() && handle instanceof MockFile) return handle;
    }
    return undefined;
  }
}

function vaultTree(): MockDir {
  const board = new MockDir(
    'Work',
    new Map<string, MockDir | MockFile>([
      ['Title.md', new MockFile('Title.md', md(7), 5)],
      ['Title 1.md', new MockFile('Title 1.md', md(7), 9)],
    ])
  );
  const todo = new MockDir('ToDo', new Map<string, MockDir | MockFile>([['Work', board]]));
  return new MockDir(
    'Vault',
    new Map<string, MockDir | MockFile>([
      ['ToDo', todo],
      ['Stray.md', new MockFile('Stray.md', md(7), 1)],
    ])
  );
}

describe('pickCanonicalVaultFile', () => {
  it('prefers a non-numbered filename over Title 1 copies', () => {
    const matches: VaultNoteFile[] = [
      { path: 'ToDo/Work/Title 1.md', markdown: md(7), updatedAt: 20 },
      { path: 'ToDo/Work/Title.md', markdown: md(7), updatedAt: 10 },
    ];
    const picked = pickCanonicalVaultFile(matches, 'ToDo/Work/Other.md');
    expect(picked?.path).toBe('ToDo/Work/Title.md');
  });

  it('prefers an exact computed basename when present', () => {
    const matches: VaultNoteFile[] = [
      { path: 'ToDo/Work/Title.md', markdown: md(7), updatedAt: 10 },
      { path: 'ToDo/Work/Title-7.md', markdown: md(7), updatedAt: 10 },
    ];
    const picked = pickCanonicalVaultFile(matches, 'ToDo/Work/Title-7.md');
    expect(picked?.path).toBe('ToDo/Work/Title-7.md');
  });
});

describe('findVaultNoteFile', () => {
  it('resolves remembered path before computed slug', async () => {
    const root = vaultTree();
    const found = await findVaultNoteFile(
      root,
      note(),
      'ToDo',
      'ToDo/Work/Renamed.md',
      'ToDo/Work/Title.md'
    );
    expect(found?.path).toBe('ToDo/Work/Title.md');
  });

  it('scans the board directory for (id N) and skips vault-root strays', async () => {
    const root = vaultTree();
    const found = await findVaultNoteFile(root, note(), 'ToDo', 'ToDo/Work/Missing.md', null);
    expect(found?.path).toBe('ToDo/Work/Title.md');
  });

  it('does not pick a same-id file sitting at the vault root', async () => {
    const root = new MockDir(
      'Vault',
      new Map<string, MockDir | MockFile>([['Stray.md', new MockFile('Stray.md', md(7))]])
    );
    const found = await findVaultNoteFile(root, note(), 'ToDo', 'ToDo/Work/Title.md', null);
    expect(found).toBeNull();
  });
});
