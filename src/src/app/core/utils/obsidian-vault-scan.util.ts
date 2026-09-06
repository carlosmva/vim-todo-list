import { Note } from '../models/note.model';
import { slugifyObsidianBoardSegment } from './obsidian-markdown.util';

export interface VaultFileHandle {
  kind?: 'file';
  name?: string;
  getFile(): Promise<File>;
  /** Chrome File System Access rename/move when available. */
  move?(destination: VaultDirectoryHandle | string, name?: string): Promise<void>;
}

export interface VaultDirectoryHandle {
  kind?: 'directory';
  name?: string;
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<VaultDirectoryHandle>;
  getFileHandle(name: string, options: { create: boolean }): Promise<VaultFileHandle>;
  removeEntry?(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries?(): AsyncIterableIterator<[string, VaultFileHandle | VaultDirectoryHandle]>;
  values?(): AsyncIterableIterator<VaultFileHandle | VaultDirectoryHandle>;
}

export interface VaultNoteFile {
  path: string;
  markdown: string;
  updatedAt: number;
}

const NOTE_ID_IN_FOOTER_RE = /\(id\s+(\d+)\)/;
const NUMBERED_DUPLICATE_RE = /^(.+)\s+\d+$/;

export function noteIdFromVaultMarkdown(markdown: string): number | null {
  const match = String(markdown || '').match(NOTE_ID_IN_FOOTER_RE);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

export function boardDirectoryPath(folder: string, board: string): string {
  const boardSeg = slugifyObsidianBoardSegment(board);
  const trimmed = String(folder || '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/${boardSeg}` : boardSeg;
}

/** True only for `{notesFolder}/{boardSlug}` — never the vault root or the notes folder itself. */
export function isSafeBoardFolderPath(folder: string, relativePath: string): boolean {
  const notes = String(folder || '').trim().replace(/^\/+|\/+$/g, '');
  const path = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!path) return false;
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return false;
  if (!notes) return parts.length === 1;
  const prefix = notes.split('/').filter(Boolean);
  if (parts.length !== prefix.length + 1) return false;
  return parts.slice(0, prefix.length).join('/').toLowerCase() === prefix.join('/').toLowerCase();
}

export function joinVaultPath(...parts: string[]): string {
  return parts
    .map((part) => String(part || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

function isFileHandle(handle: VaultFileHandle | VaultDirectoryHandle): handle is VaultFileHandle {
  return handle.kind === 'file' || typeof (handle as VaultFileHandle).getFile === 'function';
}

function isDirectoryHandle(handle: VaultFileHandle | VaultDirectoryHandle): handle is VaultDirectoryHandle {
  return handle.kind === 'directory' || typeof (handle as VaultDirectoryHandle).getDirectoryHandle === 'function';
}

async function listEntries(
  directory: VaultDirectoryHandle
): Promise<Array<[string, VaultFileHandle | VaultDirectoryHandle]>> {
  const out: Array<[string, VaultFileHandle | VaultDirectoryHandle]> = [];
  try {
    if (typeof directory.entries === 'function') {
      for await (const entry of directory.entries()) out.push(entry);
      return out;
    }
  } catch {
    // Fall through to values().
  }
  try {
    if (typeof directory.values === 'function') {
      for await (const handle of directory.values()) {
        const name = String(handle.name || '');
        if (name) out.push([name, handle]);
      }
    }
  } catch {
    // Directory listing is optional; callers can still try exact-name lookups.
  }
  return out;
}

export async function getDirectoryHandleCaseInsensitive(
  parent: VaultDirectoryHandle,
  name: string,
  create: boolean
): Promise<VaultDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(name, { create: false });
  } catch {
    const entries = await listEntries(parent);
    const match = entries.find(([entryName, handle]) => entryName.toLowerCase() === name.toLowerCase() && isDirectoryHandle(handle));
    if (match) return match[1] as VaultDirectoryHandle;
    if (!create) return null;
    try {
      return await parent.getDirectoryHandle(name, { create: true });
    } catch {
      return null;
    }
  }
}

export async function getFileHandleCaseInsensitive(
  parent: VaultDirectoryHandle,
  name: string,
  create: boolean
): Promise<VaultFileHandle | null> {
  try {
    return await parent.getFileHandle(name, { create: false });
  } catch {
    const entries = await listEntries(parent);
    const match = entries.find(([entryName, handle]) => entryName.toLowerCase() === name.toLowerCase() && isFileHandle(handle));
    if (match) return match[1] as VaultFileHandle;
    if (!create) return null;
    try {
      return await parent.getFileHandle(name, { create: true });
    } catch {
      return null;
    }
  }
}

export async function getDirectoryAtPath(
  root: VaultDirectoryHandle,
  relativePath: string,
  create: boolean
): Promise<{ directory: VaultDirectoryHandle; path: string } | null> {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (!parts.length) return { directory: root, path: '' };
  let directory: VaultDirectoryHandle | null = root;
  const actual: string[] = [];
  for (const part of parts) {
    if (!directory) return null;
    directory = await getDirectoryHandleCaseInsensitive(directory, part, create);
    if (!directory) return null;
    actual.push(directory.name || part);
  }
  return { directory, path: joinVaultPath(...actual) };
}

export async function removeDirectoryAtPath(
  root: VaultDirectoryHandle,
  relativePath: string
): Promise<boolean> {
  const parts = String(relativePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  const name = parts.pop();
  if (!name) return false;
  const parent = await getDirectoryAtPath(root, parts.join('/'), false);
  if (!parent || typeof parent.directory.removeEntry !== 'function') return false;
  try {
    await parent.directory.removeEntry(name, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function getFileHandleAtPath(
  root: VaultDirectoryHandle,
  relativePath: string,
  create: boolean
): Promise<{ handle: VaultFileHandle; path: string } | null> {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) return null;
  const dir = await getDirectoryAtPath(root, parts.join('/'), create);
  if (!dir) return null;
  const handle = await getFileHandleCaseInsensitive(dir.directory, fileName, create);
  if (!handle) return null;
  const actualName = handle.name || fileName;
  return { handle, path: joinVaultPath(dir.path, actualName) };
}

async function readVaultFile(
  root: VaultDirectoryHandle,
  relativePath: string
): Promise<VaultNoteFile | null> {
  try {
    const found = await getFileHandleAtPath(root, relativePath, false);
    if (!found) return null;
    const file = await found.handle.getFile();
    return {
      path: found.path,
      markdown: await file.text(),
      updatedAt: file.lastModified,
    };
  } catch {
    return null;
  }
}

function basenameWithoutMd(path: string): string {
  const name = path.replace(/\\/g, '/').split('/').pop() || '';
  return name.replace(/\.md$/i, '');
}

function isNumberedDuplicateName(base: string): boolean {
  return NUMBERED_DUPLICATE_RE.test(base);
}

/** Prefer the original file over Obsidian's "Name 1" / "Name 2" copies. */
export function pickCanonicalVaultFile(matches: VaultNoteFile[], computedPath: string): VaultNoteFile | null {
  if (!matches.length) return null;
  const computedBase = basenameWithoutMd(computedPath).toLowerCase();

  const exact = matches.find((file) => basenameWithoutMd(file.path).toLowerCase() === computedBase);
  if (exact) return exact;

  const originals = matches.filter((file) => !isNumberedDuplicateName(basenameWithoutMd(file.path)));
  if (originals.length) {
    return originals.reduce((oldest, file) => (file.updatedAt <= oldest.updatedAt ? file : oldest));
  }

  return matches.reduce((oldest, file) => (file.updatedAt <= oldest.updatedAt ? file : oldest));
}

async function collectMarkdownInDirectory(
  directory: VaultDirectoryHandle,
  relativeDir: string,
  noteId: number | null,
  into: VaultNoteFile[],
  depth: number
): Promise<void> {
  const entries = await listEntries(directory);
  for (const [name, handle] of entries) {
    if (name.startsWith('.')) continue;
    if (isFileHandle(handle) && name.toLowerCase().endsWith('.md')) {
      try {
        const file = await handle.getFile();
        const markdown = await file.text();
        if (noteId != null && noteIdFromVaultMarkdown(markdown) !== noteId) continue;
        into.push({
          path: joinVaultPath(relativeDir, name),
          markdown,
          updatedAt: file.lastModified,
        });
      } catch {
        // Skip unreadable files.
      }
      continue;
    }
    if (depth > 0 && isDirectoryHandle(handle)) {
      await collectMarkdownInDirectory(handle, joinVaultPath(relativeDir, name), noteId, into, depth - 1);
    }
  }
}

/**
 * List `{notesFolder}/{board}/*.md` only. Groups by footer id and prefers the
 * canonical file when several copies share an id. Files without `(id N)` are counted.
 */
export async function collectNotesFolderVaultFiles(
  root: VaultDirectoryHandle,
  folder: string
): Promise<{ byId: Map<number, VaultNoteFile>; ignoredCount: number }> {
  const byIdMatches = new Map<number, VaultNoteFile[]>();
  let ignoredCount = 0;
  const notesDir = await getDirectoryAtPath(root, folder, false);
  if (!notesDir) return { byId: new Map(), ignoredCount: 0 };

  const entries = await listEntries(notesDir.directory);
  for (const [name, handle] of entries) {
    if (name.startsWith('.')) continue;
    if (isFileHandle(handle) && name.toLowerCase().endsWith('.md')) {
      ignoredCount += 1;
      continue;
    }
    if (!isDirectoryHandle(handle)) continue;
    const files: VaultNoteFile[] = [];
    await collectMarkdownInDirectory(handle, joinVaultPath(notesDir.path, name), null, files, 0);
    for (const file of files) {
      const id = noteIdFromVaultMarkdown(file.markdown);
      if (id == null) {
        ignoredCount += 1;
        continue;
      }
      const list = byIdMatches.get(id) ?? [];
      list.push(file);
      byIdMatches.set(id, list);
    }
  }

  const byId = new Map<number, VaultNoteFile>();
  for (const [id, files] of byIdMatches) {
    const picked = pickCanonicalVaultFile(files, files[0]?.path ?? '');
    if (picked) byId.set(id, picked);
  }
  return { byId, ignoredCount };
}

function markdownMatchesNote(markdown: string, noteId: number): boolean {
  const footerId = noteIdFromVaultMarkdown(markdown);
  return footerId === noteId || footerId === null;
}

/**
 * Find the vault .md for a note.
 * Remembered path, then computed path, then the board directory for `(id N)`.
 * Does not walk the vault root (that matched stray copies and caused duplicate creates).
 */
export async function findVaultNoteFile(
  root: VaultDirectoryHandle,
  note: Note,
  folder: string,
  computedPath: string,
  rememberedPath?: string | null
): Promise<VaultNoteFile | null> {
  const matches: VaultNoteFile[] = [];

  if (rememberedPath) {
    const remembered = await readVaultFile(root, rememberedPath);
    if (remembered && markdownMatchesNote(remembered.markdown, note.id)) {
      matches.push(remembered);
    }
  }

  const atComputed = await readVaultFile(root, computedPath);
  if (atComputed && noteIdFromVaultMarkdown(atComputed.markdown) === note.id) {
    matches.push(atComputed);
  }

  const boardPath = boardDirectoryPath(folder, note.board);
  const boardDir = await getDirectoryAtPath(root, boardPath, false);
  if (boardDir) {
    await collectMarkdownInDirectory(boardDir.directory, boardDir.path, note.id, matches, 0);
  }

  const unique = new Map<string, VaultNoteFile>();
  for (const file of matches) unique.set(file.path.toLowerCase(), file);
  return pickCanonicalVaultFile([...unique.values()], rememberedPath || computedPath);
}
