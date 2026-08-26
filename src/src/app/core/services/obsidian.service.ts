import { Injectable, inject } from '@angular/core';
import { Note } from '../models/note.model';
import {
  buildObsidianMarkdown,
  normalizeObsidianMarkdown,
  obsidianBaseFilenameStem,
  parseObsidianMarkdownImport,
  readObsidianSyncEnabled,
  slugifyObsidianBoardSegment,
} from '../utils/obsidian-markdown.util';
import {
  findVaultNoteFile,
  getDirectoryAtPath,
  getFileHandleAtPath,
  joinVaultPath,
  type VaultDirectoryHandle,
  type VaultFileHandle,
  type VaultNoteFile,
} from '../utils/obsidian-vault-scan.util';
import { ChromeStorageService } from './chrome-storage.service';
import { DatabaseService } from './database.service';
import { NotesRepository } from './notes.repository';

type VaultPermission = 'granted' | 'denied' | 'prompt';

interface WritableVaultFileHandle extends VaultFileHandle {
  createWritable(): Promise<{ write(content: string): Promise<void>; close(): Promise<void> }>;
}

interface WritableVaultDirectoryHandle extends VaultDirectoryHandle {
  queryPermission(options: { mode: 'readwrite' }): Promise<VaultPermission>;
  requestPermission(options: { mode: 'readwrite' }): Promise<VaultPermission>;
}

interface ObsidianVaultIdbApi {
  loadVaultHandle(): Promise<WritableVaultDirectoryHandle | null>;
}

const OBSIDIAN_VAULT_TIME_SLACK_MS = 750;
const OBSIDIAN_PATH_CREATED_PREFIX = 'obsidianPathCreated_v1:';
const OBSIDIAN_FILE_PATH_MAP_KEY = 'obsidianVaultFilePathByNoteId_v1';

export type ObsidianErrorCode =
  | 'permission-denied'
  | 'no-folder'
  | 'write-failed'
  | 'vault-mismatch'
  | 'lookup-failed';

export interface ObsidianConflict {
  noteId: number;
  appMarkdown: string;
  vaultMarkdown: string;
  vaultUpdatedAt: number;
  appUpdatedAt: number;
  vaultNewerByClock: boolean;
  appNewerByClock: boolean;
  afterResolve: 'editor' | 'obsidian' | null;
  /** Actual vault relative path (may differ from current title slug). */
  vaultPath: string;
}

export type ObsidianOpResult =
  | { kind: 'ok'; warning?: string; path?: string }
  | { kind: 'conflict'; conflict: ObsidianConflict }
  | { kind: 'error'; code: ObsidianErrorCode; message: string };

const ERROR_MESSAGES: Record<ObsidianErrorCode, string> = {
  'permission-denied': 'Obsidian folder access was denied. Grant access under Settings → Obsidian.',
  'no-folder': 'Two-way Obsidian sync needs a linked vault folder. Choose a folder under Settings → Obsidian.',
  'write-failed': 'Could not write the Obsidian vault file. No extra note was created.',
  'vault-mismatch': 'Set the Obsidian vault name in Settings so it matches the vault shown in Obsidian.',
  'lookup-failed': 'Could not read the Obsidian vault folder. No extra note was created.',
};

function errorResult(code: ObsidianErrorCode, message?: string): Extract<ObsidianOpResult, { kind: 'error' }> {
  return { kind: 'error', code, message: message || ERROR_MESSAGES[code] };
}

function pathsEqual(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase() === b.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

/** Synchronizes note Markdown with the folder selected through the vault picker. */
@Injectable({ providedIn: 'root' })
export class ObsidianService {
  private readonly storage = inject(ChromeStorageService);
  private readonly dbService = inject(DatabaseService);
  private readonly repo = inject(NotesRepository);
  private filePathByNote = new Map<string, string>();
  private filePathMapLoaded = false;
  private vaultRoot: WritableVaultDirectoryHandle | null = null;

  isConfigured(): boolean {
    return !!this.settings().vault;
  }

  isSyncMode(): boolean {
    return this.settings().sync;
  }

  /**
   * Must run in the same user-gesture as the click. Chrome expires folder permission
   * if we await other work first, which made vault scans fail and triggered duplicates.
   */
  async ensureVaultAccess(): Promise<boolean> {
    if (!this.settings().sync) return true;
    const root = this.vaultRoot ?? (await this.loadVaultRoot());
    if (!root) return false;
    try {
      return (await root.requestPermission({ mode: 'readwrite' })) === 'granted';
    } catch {
      return false;
    }
  }

  async syncBeforeEditorOpen(noteId: number): Promise<ObsidianOpResult> {
    return this.syncWithVault(noteId);
  }

  async syncWithVault(noteId: number): Promise<ObsidianOpResult> {
    const note = this.repo.queryNote(noteId);
    if (!note) return { kind: 'ok' };
    const settings = this.settings();
    if (!settings.sync) return { kind: 'ok' };
    if (!settings.vault) return errorResult('vault-mismatch');

    const resolved = await this.resolveWritableRoot();
    if (!resolved.ok) return errorResult(resolved.code);

    const computedPath = this.relativePath(note);
    const rememberedPath = await this.rememberedFilePath(settings.vault, note.id);
    const appMarkdown = normalizeObsidianMarkdown(buildObsidianMarkdown(note));
    const appUpdatedAt = Number.isFinite(note.updated_at) ? note.updated_at : 0;

    let vaultFile: VaultNoteFile | null;
    try {
      vaultFile = await findVaultNoteFile(resolved.root, note, settings.folder, computedPath, rememberedPath);
    } catch {
      return errorResult('lookup-failed');
    }

    if (!vaultFile) return { kind: 'ok' };

    await this.rememberFilePath(settings.vault, note.id, vaultFile.path);
    const vaultMarkdown = normalizeObsidianMarkdown(vaultFile.markdown);
    const vaultUpdatedAt = vaultFile.updatedAt;
    if (appMarkdown !== vaultMarkdown) {
      return {
        kind: 'conflict',
        conflict: {
          noteId: note.id,
          appMarkdown,
          vaultMarkdown,
          vaultUpdatedAt,
          appUpdatedAt,
          vaultNewerByClock: vaultUpdatedAt > appUpdatedAt + OBSIDIAN_VAULT_TIME_SLACK_MS,
          appNewerByClock: appUpdatedAt > vaultUpdatedAt,
          afterResolve: null,
          vaultPath: vaultFile.path,
        },
      };
    }
    this.repo.updateNoteUpdatedAt(note.id, vaultUpdatedAt);
    await this.dbService.persist();
    this.markPathCreated(settings.vault, note.id);
    return { kind: 'ok', path: vaultFile.path, warning: this.vaultNameWarning(resolved.root, settings.vault) };
  }

  async resolveConflict(conflict: ObsidianConflict, choice: 'app' | 'vault'): Promise<ObsidianOpResult> {
    const note = this.repo.queryNote(conflict.noteId);
    if (!note) return errorResult('lookup-failed');
    const vaultPath = conflict.vaultPath || this.relativePath(note);
    const settings = this.settings();
    if (choice === 'app') {
      const resolved = await this.resolveWritableRoot();
      if (!resolved.ok) return errorResult(resolved.code);
      if (!this.canWriteVault()) return errorResult('no-folder');
      const written = await this.pushNote(note, resolved.root, vaultPath);
      if (!written.ok) return errorResult(written.code);
      return { kind: 'ok', path: written.path };
    }
    const imported = parseObsidianMarkdownImport(conflict.vaultMarkdown);
    this.repo.updateNoteFromVault(note.id, imported.title || note.text, imported.notes_html, conflict.vaultUpdatedAt);
    await this.dbService.persist();
    await this.rememberFilePath(settings.vault, note.id, vaultPath);
    this.markPathCreated(settings.vault, note.id);
    return { kind: 'ok', path: vaultPath };
  }

  async pushNoteById(noteId: number): Promise<boolean> {
    const result = await this.pushCanonical(noteId);
    return result.kind === 'ok';
  }

  async openNote(noteId: number): Promise<ObsidianOpResult> {
    return this.navigateToNote(noteId);
  }

  /**
   * Open Obsidian for a note after sync.
   * Sync + folder: filesystem write then `obsidian://open` only — never `new` after a failed scan.
   * URI-only: `new` on first-open cache miss, then `open`.
   */
  async navigateToNote(noteId: number, opts: { skipVaultWrite?: boolean } = {}): Promise<ObsidianOpResult> {
    const note = this.repo.queryNote(noteId);
    if (!note) return { kind: 'ok' };
    const settings = this.settings();
    if (!settings.vault) return errorResult('vault-mismatch');
    const computedPath = this.relativePath(note);
    const rememberedPath = await this.rememberedFilePath(settings.vault, note.id);

    if (settings.sync) {
      return this.navigateWithFilesystem(note, settings, computedPath, rememberedPath, opts.skipVaultWrite === true);
    }

    return this.navigateUriOnly(note, settings.vault, computedPath, rememberedPath);
  }

  async openObsidianUrl(url: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      try {
        await chrome.tabs.create({ url });
        return;
      } catch {
        // Chrome can reject a custom protocol from tabs.create; use a user-initiated anchor instead.
      }
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  buildOpenUrl(vault: string, relPath: string): string {
    const file = relPath.replace(/\\/g, '/').replace(/\.md$/i, '');
    return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;
  }

  buildNewUrl(vault: string, relPath: string, note: Note): string {
    const file = relPath.replace(/\\/g, '/').replace(/\.md$/i, '');
    return (
      `obsidian://new?vault=${encodeURIComponent(vault)}` +
      `&file=${encodeURIComponent(file)}` +
      `&content=${encodeURIComponent(buildObsidianMarkdown(note))}`
    );
  }

  async clearPathCaches(): Promise<void> {
    this.filePathByNote.clear();
    this.filePathMapLoaded = true;
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith('obsidianVaultFile:') || key.startsWith(OBSIDIAN_PATH_CREATED_PREFIX)) keys.push(key);
      }
      for (const key of keys) localStorage.removeItem(key);
    } catch {
      // ignore
    }
    try {
      await chrome.storage.local.set({ [OBSIDIAN_FILE_PATH_MAP_KEY]: {} });
    } catch {
      // ignore
    }
  }

  private async navigateWithFilesystem(
    note: Note,
    settings: { vault: string; folder: string; sync: boolean },
    computedPath: string,
    rememberedPath: string | null,
    skipVaultWrite: boolean
  ): Promise<ObsidianOpResult> {
    const resolved = await this.resolveWritableRoot();
    if (!resolved.ok) return errorResult(resolved.code);

    let existing: VaultNoteFile | null;
    try {
      existing = await findVaultNoteFile(resolved.root, note, settings.folder, computedPath, rememberedPath);
    } catch {
      return errorResult('lookup-failed');
    }

    const nameWarning = this.vaultNameWarning(resolved.root, settings.vault);
    let warning = nameWarning;
    let targetPath = existing?.path ?? computedPath;

    if (existing?.path && !pathsEqual(existing.path, computedPath)) {
      const renamed = await this.tryRenameCanonical(resolved.root, note.id, existing.path, computedPath);
      targetPath = renamed.path;
      if (renamed.warning) warning = [warning, renamed.warning].filter(Boolean).join(' ');
    }

    if (!skipVaultWrite) {
      const written = await this.pushNote(note, resolved.root, targetPath);
      if (!written.ok) return errorResult(written.code);
      targetPath = written.path;
    } else {
      await this.rememberFilePath(settings.vault, note.id, targetPath);
      this.markPathCreated(settings.vault, note.id);
    }

    await this.openObsidianUrl(this.buildOpenUrl(settings.vault, targetPath));
    return { kind: 'ok', path: targetPath, warning };
  }

  private async navigateUriOnly(
    note: Note,
    vault: string,
    computedPath: string,
    rememberedPath: string | null
  ): Promise<ObsidianOpResult> {
    const path = rememberedPath || computedPath;
    if (this.isPathCreated(vault, note.id) || rememberedPath) {
      await this.openObsidianUrl(this.buildOpenUrl(vault, path));
      return { kind: 'ok', path };
    }
    await this.openObsidianUrl(this.buildNewUrl(vault, computedPath, note));
    this.markPathCreated(vault, note.id);
    await this.rememberFilePath(vault, note.id, computedPath);
    return { kind: 'ok', path: computedPath };
  }

  private async pushCanonical(noteId: number): Promise<ObsidianOpResult> {
    const note = this.repo.queryNote(noteId);
    if (!note) return { kind: 'ok' };
    const settings = this.settings();
    if (!settings.sync) return { kind: 'ok' };
    const resolved = await this.resolveWritableRoot();
    if (!resolved.ok) return errorResult(resolved.code);

    const computedPath = this.relativePath(note);
    const rememberedPath = await this.rememberedFilePath(settings.vault, note.id);
    let existing: VaultNoteFile | null;
    try {
      existing = await findVaultNoteFile(resolved.root, note, settings.folder, computedPath, rememberedPath);
    } catch {
      return errorResult('lookup-failed');
    }

    let targetPath = existing?.path ?? computedPath;
    let warning: string | undefined;
    if (existing?.path && !pathsEqual(existing.path, computedPath)) {
      const renamed = await this.tryRenameCanonical(resolved.root, note.id, existing.path, computedPath);
      targetPath = renamed.path;
      warning = renamed.warning;
    }

    const written = await this.pushNote(note, resolved.root, targetPath);
    if (!written.ok) return errorResult(written.code);
    return { kind: 'ok', path: written.path, warning };
  }

  private async tryRenameCanonical(
    root: WritableVaultDirectoryHandle,
    noteId: number,
    fromPath: string,
    toPath: string
  ): Promise<{ path: string; warning?: string }> {
    const keep =
      'Kept the original Obsidian filename because the vault file could not be renamed.';
    try {
      const found = await getFileHandleAtPath(root, fromPath, false);
      if (!found) return { path: fromPath, warning: keep };
      const parts = toPath.replace(/\\/g, '/').split('/').filter(Boolean);
      const destName = parts.pop();
      if (!destName) return { path: fromPath, warning: keep };
      const destDir = await getDirectoryAtPath(root, parts.join('/'), true);
      if (!destDir) return { path: fromPath, warning: keep };
      const handle = found.handle;
      if (typeof handle.move !== 'function') return { path: fromPath, warning: keep };
      await handle.move(destDir.directory, destName);
      const nextPath = joinVaultPath(destDir.path, destName);
      await this.rememberFilePath(this.settings().vault, noteId, nextPath);
      return { path: nextPath };
    } catch {
      return { path: fromPath, warning: keep };
    }
  }

  private filePathKey(vault: string, noteId: number): string {
    return `${vault}\n${noteId}`;
  }

  private async ensureFilePathMap(): Promise<void> {
    if (this.filePathMapLoaded) return;
    this.filePathMapLoaded = true;
    try {
      const stored = await chrome.storage.local.get(OBSIDIAN_FILE_PATH_MAP_KEY);
      const raw = stored[OBSIDIAN_FILE_PATH_MAP_KEY];
      if (raw && typeof raw === 'object') {
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
          if (typeof value === 'string' && value.trim()) this.filePathByNote.set(key, value.trim());
        }
      }
    } catch {
      // localStorage fallback below.
    }
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('obsidianVaultFile:')) continue;
        const path = localStorage.getItem(key);
        const mapKey = key.slice('obsidianVaultFile:'.length);
        if (path && mapKey && !this.filePathByNote.has(mapKey)) this.filePathByNote.set(mapKey, path);
      }
    } catch {
      // ignore
    }
  }

  private async rememberedFilePath(vault: string, noteId: number): Promise<string | null> {
    await this.ensureFilePathMap();
    const exact = this.filePathByNote.get(this.filePathKey(vault, noteId));
    if (exact) return exact;
    const byId = this.filePathByNote.get(String(noteId));
    if (byId) return byId;
    const suffix = `\n${noteId}`;
    for (const [key, path] of this.filePathByNote) {
      if (key.endsWith(suffix)) return path;
    }
    return null;
  }

  async forgetFilePath(noteId: number): Promise<void> {
    await this.ensureFilePathMap();
    const keys = [...this.filePathByNote.keys()].filter(
      (key) => key === String(noteId) || key.endsWith(`\n${noteId}`)
    );
    for (const key of keys) {
      this.filePathByNote.delete(key);
      try {
        localStorage.removeItem(`obsidianVaultFile:${key}`);
      } catch {
        // ignore
      }
    }
    try {
      localStorage.removeItem(`${OBSIDIAN_PATH_CREATED_PREFIX}${noteId}`);
      const vault = this.settings().vault;
      if (vault) localStorage.removeItem(`${OBSIDIAN_PATH_CREATED_PREFIX}${vault}\n${noteId}`);
    } catch {
      // ignore
    }
    try {
      const payload: Record<string, string> = {};
      for (const [mapKey, value] of this.filePathByNote) payload[mapKey] = value;
      await chrome.storage.local.set({ [OBSIDIAN_FILE_PATH_MAP_KEY]: payload });
    } catch {
      // ignore
    }
  }

  private async rememberFilePath(vault: string, noteId: number, relativePath: string): Promise<void> {
    const path = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!path || !noteId) return;
    await this.ensureFilePathMap();
    const key = this.filePathKey(vault, noteId);
    if (this.filePathByNote.get(key) === path) {
      this.markPathCreated(vault, noteId);
      return;
    }
    this.filePathByNote.set(key, path);
    this.filePathByNote.set(String(noteId), path);
    this.markPathCreated(vault, noteId);
    try {
      localStorage.setItem(`obsidianVaultFile:${key}`, path);
    } catch {
      // ignore
    }
    try {
      const payload: Record<string, string> = {};
      for (const [mapKey, value] of this.filePathByNote) payload[mapKey] = value;
      await chrome.storage.local.set({ [OBSIDIAN_FILE_PATH_MAP_KEY]: payload });
    } catch {
      // ignore
    }
  }

  private markPathCreated(vault: string, noteId: number): void {
    try {
      localStorage.setItem(`${OBSIDIAN_PATH_CREATED_PREFIX}${noteId}`, '1');
      localStorage.setItem(`${OBSIDIAN_PATH_CREATED_PREFIX}${vault}\n${noteId}`, '1');
    } catch {
      // ignore
    }
  }

  private isPathCreated(vault: string, noteId: number): boolean {
    try {
      return (
        localStorage.getItem(`${OBSIDIAN_PATH_CREATED_PREFIX}${vault}\n${noteId}`) === '1' ||
        localStorage.getItem(`${OBSIDIAN_PATH_CREATED_PREFIX}${noteId}`) === '1'
      );
    } catch {
      return false;
    }
  }

  private settings(): { vault: string; folder: string; sync: boolean } {
    const env = this.storage.getEnvelope().obs;
    const dbSync = this.dbService.getSetting('obsidian.syncMode');
    return {
      vault: (this.dbService.getSetting('obsidian.vaultName') ?? env?.v ?? '').trim(),
      folder: (this.dbService.getSetting('obsidian.notesFolder') ?? env?.f ?? '').trim().replace(/^\/+|\/+$/g, ''),
      sync: readObsidianSyncEnabled(dbSync, env?.s),
    };
  }

  /** Load the linked vault folder; retry if the IDB helper was not ready on first inject. */
  private async loadVaultRoot(): Promise<WritableVaultDirectoryHandle | null> {
    if (this.vaultRoot) return this.vaultRoot;
    try {
      const api = (window as Window & { ObsidianVaultIdb?: ObsidianVaultIdbApi }).ObsidianVaultIdb;
      if (!api) return null;
      const root = await api.loadVaultHandle();
      if (root) this.vaultRoot = root;
      return root;
    } catch {
      return null;
    }
  }

  private async resolveWritableRoot(): Promise<
    { ok: true; root: WritableVaultDirectoryHandle } | { ok: false; code: 'no-folder' | 'permission-denied' }
  > {
    try {
      const root = this.vaultRoot ?? (await this.loadVaultRoot());
      if (!root) return { ok: false, code: 'no-folder' };
      try {
        const permission = await root.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') return { ok: false, code: 'permission-denied' };
      } catch {
        return { ok: false, code: 'permission-denied' };
      }
      return { ok: true, root };
    } catch {
      return { ok: false, code: 'no-folder' };
    }
  }

  private vaultNameWarning(root: WritableVaultDirectoryHandle, vault: string): string | undefined {
    const folderName = String(root.name || '').trim();
    if (!folderName || !vault) return undefined;
    if (folderName.toLowerCase() === vault.toLowerCase()) return undefined;
    return `Vault name "${vault}" does not match the linked folder "${folderName}". Opens in Obsidian may fail until the names match.`;
  }

  private canWriteVault(): boolean {
    return this.settings().sync;
  }

  private async pushNote(
    note: Note,
    root: WritableVaultDirectoryHandle,
    path: string
  ): Promise<{ ok: true; path: string } | { ok: false; code: 'permission-denied' | 'write-failed' }> {
    if (!this.canWriteVault()) return { ok: false, code: 'permission-denied' };
    try {
      const permission = await root.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') return { ok: false, code: 'permission-denied' };
    } catch {
      return { ok: false, code: 'permission-denied' };
    }
    try {
      const found = await getFileHandleAtPath(root, path, true);
      if (!found) return { ok: false, code: 'write-failed' };
      const writable = await (found.handle as WritableVaultFileHandle).createWritable();
      await writable.write(buildObsidianMarkdown(note));
      await writable.close();
      this.repo.updateNoteUpdatedAt(note.id, (await found.handle.getFile()).lastModified);
      await this.dbService.persist();
      await this.rememberFilePath(this.settings().vault, note.id, found.path);
      return { ok: true, path: found.path };
    } catch {
      return { ok: false, code: 'write-failed' };
    }
  }

  private relativePath(note: Note): string {
    const folder = this.settings().folder;
    const board = slugifyObsidianBoardSegment(note.board);
    const base = obsidianBaseFilenameStem(this.repo.queryNotes(note.board), note);
    return `${folder ? `${folder}/` : ''}${board}/${base}.md`;
  }
}
