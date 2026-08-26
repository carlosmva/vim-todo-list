import { Injectable } from '@angular/core';
import type { Database } from 'sql.js';
import {
  Note,
  NoteLink,
  NotePriority,
  normalizePriority,
  nextPriority,
} from '../models/note.model';
import { DatabaseService } from './database.service';

@Injectable({ providedIn: 'root' })
export class NotesRepository {
  constructor(private readonly dbService: DatabaseService) {}

  private db(): Database {
    return this.dbService.getDb();
  }

  queryBoards(): string[] {
    const res = this.db().exec(
      'SELECT name FROM boards ORDER BY sort_order ASC, created_at ASC, name ASC'
    );
    if (!res.length) return [];
    return res[0].values.map((r) => String(r[0])).filter(Boolean);
  }

  addBoard(name: string): boolean {
    const n = String(name || '').trim();
    if (!n) return false;
    let nextSortOrder = 0;
    try {
      const maxRes = this.db().exec('SELECT COALESCE(MAX(sort_order), -1) AS m FROM boards');
      const m = maxRes.length ? Number(maxRes[0].values?.[0]?.[0]) : -1;
      nextSortOrder = (Number.isFinite(m) ? m : -1) + 1;
    } catch {
      nextSortOrder = 0;
    }
    const stmt = this.db().prepare(
      'INSERT OR IGNORE INTO boards(name, created_at, sort_order) VALUES(?, ?, ?)'
    );
    stmt.run([n, Date.now(), nextSortOrder]);
    stmt.free();
    return true;
  }

  deleteBoard(name: string): void {
    const n = String(name || '').trim();
    if (!n) return;
    this.db().run('BEGIN');
    try {
      this.db().run('DELETE FROM notes WHERE board = ?', [n]);
      this.db().run('DELETE FROM boards WHERE name = ?', [n]);
    } finally {
      this.db().run('COMMIT');
    }
  }

  moveBoard(name: string, direction: 'up' | 'down'): boolean {
    const boards = this.queryBoards();
    const index = boards.indexOf(name);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= boards.length) return false;
    [boards[index], boards[targetIndex]] = [boards[targetIndex], boards[index]];

    this.db().run('BEGIN');
    try {
      const stmt = this.db().prepare('UPDATE boards SET sort_order = ? WHERE name = ?');
      for (const [sortOrder, board] of boards.entries()) stmt.run([sortOrder, board]);
      stmt.free();
      this.db().run('COMMIT');
      return true;
    } catch {
      this.db().run('ROLLBACK');
      return false;
    }
  }

  queryNotes(board: string): Note[] {
    const res = this.db().exec(
      `SELECT id, text, status, priority, created_at, updated_at, completed_at, notes_html, sort_order, board, due_at
       FROM notes WHERE board = ?
       ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, sort_order ASC,
         CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 ELSE 1 END,
         created_at DESC, id DESC`,
      [board]
    );
    return this.mapNotes(res);
  }

  queryAllNotes(): Note[] {
    const res = this.db().exec(
      `SELECT id, text, status, priority, created_at, updated_at, completed_at, notes_html, sort_order, board, due_at
       FROM notes
       ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, board ASC, sort_order ASC,
         CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 ELSE 1 END,
         created_at DESC, id DESC`
    );
    return this.mapNotes(res);
  }

  queryNotesByDueRange(startTs: number, endTs: number): Note[] {
    const stmt = this.db().prepare(
      `SELECT id, text, status, priority, created_at, updated_at, completed_at, notes_html, sort_order, board, due_at
       FROM notes WHERE status = 'pending' AND due_at IS NOT NULL AND due_at >= ? AND due_at < ?
       ORDER BY due_at ASC, id ASC`
    );
    stmt.bind([startTs, endTs]);
    const rows: Note[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      rows.push(this.mapRow(row));
    }
    stmt.free();
    return rows;
  }

  insertNote(board: string, text: string, dueAt: number | null = null): void {
    const now = Date.now();
    const sortOrder = this.getNextPendingSortOrder(board);
    const stmt = this.db().prepare(
      `INSERT INTO notes(text, status, priority, created_at, updated_at, completed_at, notes_html, sort_order, board, due_at)
       VALUES (?, 'pending', 'normal', ?, ?, NULL, '', ?, ?, ?)`
    );
    stmt.run([text.trim(), now, now, sortOrder, board, dueAt]);
    stmt.free();
  }

  updateDueAt(noteId: number, dueAt: number | null): void {
    const stmt = this.db().prepare('UPDATE notes SET due_at = ?, updated_at = ? WHERE id = ?');
    stmt.run([dueAt, Date.now(), noteId]);
    stmt.free();
  }

  togglePriority(noteId: number): void {
    const res = this.db().exec('SELECT priority FROM notes WHERE id = ?', [noteId]);
    if (!res.length) return;
    const current = res[0].values[0][0];
    const next = nextPriority(current);
    const stmt = this.db().prepare('UPDATE notes SET priority = ?, updated_at = ? WHERE id = ?');
    stmt.run([next, Date.now(), noteId]);
    stmt.free();
  }

  setStatus(noteId: number, status: 'pending' | 'complete'): void {
    const now = Date.now();
    if (status === 'complete') {
      this.db().run(
        "UPDATE notes SET status = 'complete', completed_at = ?, updated_at = ? WHERE id = ?",
        [now, now, noteId]
      );
    } else {
      this.db().run(
        "UPDATE notes SET status = 'pending', completed_at = NULL, updated_at = ? WHERE id = ?",
        [now, noteId]
      );
    }
  }

  deleteNote(noteId: number): void {
    this.db().run('BEGIN');
    try {
      const stmt1 = this.db().prepare('DELETE FROM note_links WHERE note_id = ?');
      stmt1.run([noteId]);
      stmt1.free();
      const stmt2 = this.db().prepare('DELETE FROM notes WHERE id = ?');
      stmt2.run([noteId]);
      stmt2.free();
    } finally {
      this.db().run('COMMIT');
    }
  }

  updateNotesHtml(noteId: number, html: string): void {
    const stmt = this.db().prepare('UPDATE notes SET notes_html = ?, updated_at = ? WHERE id = ?');
    stmt.run([html, Date.now(), noteId]);
    stmt.free();
  }

  updateNoteText(noteId: number, text: string): void {
    const stmt = this.db().prepare('UPDATE notes SET text = ?, updated_at = ? WHERE id = ?');
    stmt.run([text.trim(), Date.now(), noteId]);
    stmt.free();
  }

  queryLinks(noteId: number): NoteLink[] {
    const res = this.db().exec(
      'SELECT id, url, description, created_at FROM note_links WHERE note_id = ? ORDER BY created_at DESC, id DESC',
      [noteId]
    );
    if (!res.length) return [];
    const { columns, values } = res[0];
    const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
    return values.map((row) => ({
      id: row[idx['id']] as number,
      url: row[idx['url']] as string,
      description: row[idx['description']] as string | null,
      created_at: row[idx['created_at']] as number,
    }));
  }

  insertLink(noteId: number, url: string, description: string): void {
    const stmt = this.db().prepare(
      'INSERT INTO note_links(note_id, url, description, created_at) VALUES (?, ?, ?, ?)'
    );
    stmt.run([noteId, url, description, Date.now()]);
    stmt.free();
  }

  deleteLink(linkId: number): void {
    const stmt = this.db().prepare('DELETE FROM note_links WHERE id = ?');
    stmt.run([linkId]);
    stmt.free();
  }

  reorderPending(noteId: number, board: string, direction: 'up' | 'down'): void {
    const notes = this.queryNotes(board).filter((n) => n.status === 'pending');
    const idx = notes.findIndex((n) => n.id === noteId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= notes.length) return;
    const a = notes[idx];
    const b = notes[swapIdx];
    const stmt = this.db().prepare('UPDATE notes SET sort_order = ? WHERE id = ?');
    stmt.run([b.sort_order, a.id]);
    stmt.run([a.sort_order, b.id]);
    stmt.free();
  }

  private getNextPendingSortOrder(board: string): number {
    const res = this.db().exec(
      "SELECT COALESCE(MIN(sort_order), 1) AS m FROM notes WHERE board = ? AND status = 'pending'",
      [board]
    );
    if (!res.length) return 0;
    const n = Number(res[0].values?.[0]?.[0]);
    return Number.isFinite(n) ? n - 1 : 0;
  }

  private mapNotes(res: { columns: string[]; values: unknown[][] }[]): Note[] {
    if (!res.length) return [];
    const { columns, values } = res[0];
    const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
    return values.map((row) => ({
      id: row[idx['id']] as number,
      text: row[idx['text']] as string,
      status: row[idx['status']] as Note['status'],
      priority: normalizePriority(row[idx['priority']]),
      created_at: row[idx['created_at']] as number,
      updated_at: row[idx['updated_at']] as number,
      completed_at: row[idx['completed_at']] as number | null,
      notes_html: row[idx['notes_html']] as string,
      sort_order: row[idx['sort_order']] as number,
      board: row[idx['board']] as string,
      due_at: row[idx['due_at']] != null ? (row[idx['due_at']] as number) : null,
    }));
  }

  private mapRow(row: Record<string, unknown>): Note {
    return {
      id: row['id'] as number,
      text: row['text'] as string,
      status: row['status'] as Note['status'],
      priority: normalizePriority(row['priority']),
      created_at: row['created_at'] as number,
      updated_at: row['updated_at'] as number,
      completed_at: (row['completed_at'] as number | null) ?? null,
      notes_html: (row['notes_html'] as string) ?? '',
      sort_order: row['sort_order'] as number,
      board: row['board'] as string,
      due_at: row['due_at'] != null ? (row['due_at'] as number) : null,
    };
  }
}

export function filterNotes(notes: Note[], query: string): Note[] {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return notes;
  return notes.filter((n) => n.text.toLowerCase().includes(q));
}
