import { Injectable, inject } from '@angular/core';
import { Note } from '../models/note.model';
import { notesContentToPreviewMarkdown } from '../utils/notes-html.util';
import { ChromeStorageService } from './chrome-storage.service';
import { DatabaseService } from './database.service';
import { NotesRepository } from './notes.repository';

type VaultPermission = 'granted' | 'denied' | 'prompt';

interface VaultFileHandle {
  createWritable(): Promise<{ write(content: string): Promise<void>; close(): Promise<void> }>;
  getFile(): Promise<File>;
}

interface VaultDirectoryHandle {
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<VaultDirectoryHandle>;
  getFileHandle(name: string, options: { create: boolean }): Promise<VaultFileHandle>;
  queryPermission(options: { mode: 'readwrite' }): Promise<VaultPermission>;
  requestPermission(options: { mode: 'readwrite' }): Promise<VaultPermission>;
}

interface ObsidianVaultIdbApi {
  loadVaultHandle(): Promise<VaultDirectoryHandle | null>;
}

const VAULT_TIME_SLACK_MS = 2_000;

/** Synchronizes note Markdown with the folder selected through the vault picker. */
@Injectable({ providedIn: 'root' })
export class ObsidianService {
  private readonly storage = inject(ChromeStorageService);
  private readonly dbService = inject(DatabaseService);
  private readonly repo = inject(NotesRepository);

  isConfigured(): boolean {
    return !!this.settings().vault;
  }

  async syncBeforeEditorOpen(noteId: number): Promise<void> {
    const note = this.repo.queryNote(noteId);
    if (!note) return;
    const context = await this.getVaultContext();
    if (!context) return;

    const path = this.relativePath(note);
    try {
      const file = await (await this.getFileHandle(context.root, path, false)).getFile();
      if (file.lastModified <= note.updated_at + VAULT_TIME_SLACK_MS) {
        await this.pushNote(note, context, path);
        return;
      }
      const imported = this.noteFromMarkdown(note, await file.text());
      this.repo.updateNoteFromVault(note.id, imported.text, imported.notesHtml, file.lastModified);
      await this.dbService.persist();
    } catch {
      await this.pushNote(note, context, path);
    }
  }

  async pushNoteById(noteId: number): Promise<boolean> {
    const note = this.repo.queryNote(noteId);
    if (!note) return false;
    const context = await this.getVaultContext();
    if (!context) return false;
    await this.pushNote(note, context, this.relativePath(note));
    return true;
  }

  async openNote(noteId: number): Promise<void> {
    const note = this.repo.queryNote(noteId);
    if (!note) return;
    const settings = this.settings();
    if (!settings.vault) return;
    // A linked vault write creates parent folders and the Markdown file as needed.
    // Do not hand Obsidian a path that could not be created by the extension.
    if (!(await this.pushNoteById(noteId))) return;
    this.openObsidianUrl(this.buildOpenUrl(settings.vault, this.relativePath(note)));
  }

  openObsidianUrl(url: string): void {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url });
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    anchor.click();
  }

  buildOpenUrl(vault: string, relPath: string): string {
    return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(relPath.replace(/\\/g, '/'))}`;
  }

  private settings(): { vault: string; folder: string; sync: boolean } {
    const env = this.storage.getEnvelope().obs;
    return {
      vault: (this.dbService.getSetting('obsidian.vaultName') ?? env?.v ?? '').trim(),
      folder: (this.dbService.getSetting('obsidian.notesFolder') ?? env?.f ?? '').trim().replace(/^\/+|\/+$/g, ''),
      sync: (this.dbService.getSetting('obsidian.syncMode') ?? String(!!env?.s)) === '1',
    };
  }

  private async getVaultContext(): Promise<{ root: VaultDirectoryHandle } | null> {
    const settings = this.settings();
    if (!settings.sync || !settings.vault) return null;
    const api = (window as Window & { ObsidianVaultIdb?: ObsidianVaultIdbApi }).ObsidianVaultIdb;
    if (!api) return null;
    const root = await api.loadVaultHandle();
    if (!root) return null;
    const permission = await root.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && (await root.requestPermission({ mode: 'readwrite' })) !== 'granted') return null;
    return { root };
  }

  private async pushNote(note: Note, context: { root: VaultDirectoryHandle }, path: string): Promise<void> {
    const handle = await this.getFileHandle(context.root, path, true);
    const writable = await handle.createWritable();
    await writable.write(this.toMarkdown(note));
    await writable.close();
    this.repo.updateNoteUpdatedAt(note.id, (await handle.getFile()).lastModified);
    await this.dbService.persist();
  }

  private async getFileHandle(root: VaultDirectoryHandle, relativePath: string, create: boolean): Promise<VaultFileHandle> {
    const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error('Missing Obsidian filename');
    let directory = root;
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
    return directory.getFileHandle(fileName, { create });
  }

  private relativePath(note: Note): string {
    const folder = this.settings().folder;
    const board = this.slugify(note.board) || 'inbox';
    return `${folder ? `${folder}/` : ''}${board}/${this.filenameBase(note)}.md`;
  }

  private filenameBase(note: Note): string {
    const slug = this.slugify(note.text) || `note-${note.id}`;
    const collisions = this.repo.queryNotes(note.board).filter((item) => this.slugify(item.text) === slug);
    return collisions.length > 1 ? `${slug}-${note.id}` : slug;
  }

  private slugify(value: string): string {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  private toMarkdown(note: Note): string {
    const title = note.text.trim() || `Note ${note.id}`;
    const lines = [`# ${title}`, ''];
    if (note.due_at) lines.push(`**Due:** ${new Date(note.due_at).toLocaleDateString()}`, '');
    const body = notesContentToPreviewMarkdown(note.notes_html).trim();
    if (body) lines.push(body, '');
    lines.push('---', `*Board: ${note.board} - Vim To-Do (id ${note.id})*`, note.status === 'complete' ? '#vim-todo/complete' : '#vim-todo/pending');
    return lines.join('\n');
  }

  private noteFromMarkdown(note: Note, markdown: string): { text: string; notesHtml: string } {
    const body = String(markdown || '').replace(/\r\n/g, '\n').split(/\n---\s*(?:\n|$)/, 1)[0];
    const lines = body.split('\n');
    const title = lines[0]?.match(/^#\s+(.+)$/)?.[1]?.trim() || note.text;
    const content = lines
      .slice(/^#\s+/.test(lines[0] || '') ? 1 : 0)
      .filter((line) => !/^\*\*Due:\*\*/.test(line))
      .join('\n')
      .trim();
    return { text: title, notesHtml: content };
  }
}
