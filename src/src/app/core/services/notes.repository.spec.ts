import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_BOARD } from '../models/envelope.model';
import { ensureSchema } from '../utils/schema.util';
import { NotesRepository } from './notes.repository';

describe('NotesRepository insertNoteWithId', () => {
  let repo: NotesRepository;

  beforeAll(async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    ensureSchema(db, DEFAULT_BOARD);
    repo = new NotesRepository({
      getDb: () => db,
    } as never);
  });

  it('preserves the vault id and does not collide the next AUTOINCREMENT insert', () => {
    expect(
      repo.insertNoteWithId({
        id: 42,
        board: DEFAULT_BOARD,
        text: 'Imported',
        notes_html: 'Body',
        status: 'pending',
      })
    ).toBe(true);

    const imported = repo.queryNote(42);
    expect(imported?.text).toBe('Imported');
    expect(imported?.board).toBe(DEFAULT_BOARD);

    const nextId = repo.insertNote(DEFAULT_BOARD, 'After import');
    expect(nextId).toBe(43);
    expect(repo.queryNote(42)?.text).toBe('Imported');
    expect(repo.queryAllNotes().filter((note) => note.text === 'Imported')).toHaveLength(1);
  });

  it('creates a missing footer board and lands the note there', () => {
    expect(repo.queryBoards()).not.toContain('Archive');
    expect(
      repo.insertNoteWithId({
        id: 99,
        board: 'Archive',
        text: 'Archived card',
        status: 'complete',
        due_at: Date.UTC(2026, 0, 1),
      })
    ).toBe(true);

    expect(repo.queryBoards()).toContain('Archive');
    const note = repo.queryNote(99);
    expect(note?.board).toBe('Archive');
    expect(note?.status).toBe('complete');
    expect(note?.due_at).toBe(Date.UTC(2026, 0, 1));
  });

  it('applies vault due, status, board, and priority on import', () => {
    repo.insertNoteWithId({
      id: 8,
      board: DEFAULT_BOARD,
      text: 'Before',
      notes_html: 'old',
      status: 'pending',
    });
    repo.updateNoteFromVault(8, 'After', 'new body', 99, {
      due_at: Date.UTC(2026, 0, 15),
      status: 'complete',
      board: 'Archive',
      priority: 'high',
    });
    const updated = repo.queryNote(8);
    expect(updated?.text).toBe('After');
    expect(updated?.notes_html).toBe('new body');
    expect(updated?.due_at).toBe(Date.UTC(2026, 0, 15));
    expect(updated?.status).toBe('complete');
    expect(updated?.board).toBe('Archive');
    expect(updated?.priority).toBe('high');
    expect(repo.queryBoards()).toContain('Archive');
  });

  it('refuses to insert a duplicate id', () => {
    expect(repo.insertNoteWithId({ id: 42, board: DEFAULT_BOARD, text: 'Dup' })).toBe(false);
    expect(repo.queryNote(42)?.text).toBe('Imported');
  });
});

describe('NotesRepository renameBoard', () => {
  it('renames the board and moves notes; refuses a name that already exists', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    ensureSchema(db, DEFAULT_BOARD);
    const repo = new NotesRepository({ getDb: () => db } as never);
    repo.addBoard('Work');
    const id = repo.insertNote('Work', 'Task');
    expect(repo.renameBoard('Work', 'Work')).toBe(false);
    expect(repo.renameBoard('Work', DEFAULT_BOARD)).toBe(false);
    expect(repo.renameBoard('Work', 'Projects')).toBe(true);
    expect(repo.queryBoards()).toContain('Projects');
    expect(repo.queryBoards()).not.toContain('Work');
    expect(repo.queryNote(id)?.board).toBe('Projects');
  });
});
