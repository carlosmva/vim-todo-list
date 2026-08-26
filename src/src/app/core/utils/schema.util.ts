import type { Database } from 'sql.js';
import { DEFAULT_BOARD } from '../models/envelope.model';

export function ensureSchema(db: Database, defaultBoard = DEFAULT_BOARD): void {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS boards (
      name TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','complete')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      notes_html TEXT,
      sort_order INTEGER NOT NULL,
      board TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS note_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  for (const sql of [
    'ALTER TABLE note_links ADD COLUMN description TEXT',
    'ALTER TABLE boards ADD COLUMN sort_order INTEGER',
    'ALTER TABLE notes ADD COLUMN sort_order INTEGER',
    'ALTER TABLE notes ADD COLUMN updated_at INTEGER',
    'ALTER TABLE notes ADD COLUMN completed_at INTEGER',
    'ALTER TABLE notes ADD COLUMN notes_html TEXT',
    'ALTER TABLE notes ADD COLUMN board TEXT',
    'ALTER TABLE notes ADD COLUMN priority TEXT',
    'ALTER TABLE notes ADD COLUMN due_at INTEGER',
  ]) {
    try {
      db.run(sql);
    } catch {
      /* column exists */
    }
  }

  db.run('UPDATE notes SET board = ? WHERE board IS NULL OR board = \'\'', [defaultBoard]);
  try {
    db.run(
      "UPDATE notes SET priority = 'normal' WHERE priority IS NULL OR priority = '' OR priority NOT IN ('low','normal','high')"
    );
  } catch {
    /* ignore */
  }

  db.run('UPDATE notes SET updated_at = created_at WHERE updated_at IS NULL');
  db.run("UPDATE notes SET completed_at = updated_at WHERE status = 'complete' AND completed_at IS NULL");
  db.run("UPDATE notes SET notes_html = '' WHERE notes_html IS NULL");
  try {
    db.run('UPDATE boards SET sort_order = 0 WHERE sort_order IS NULL');
  } catch {
    /* ignore */
  }

  const boardsRes = db.exec(
    "SELECT DISTINCT board FROM notes WHERE board IS NOT NULL AND board <> '' ORDER BY board ASC"
  );
  const boards = boardsRes.length ? boardsRes[0].values.map((r) => r[0] as string) : [];
  for (const board of boards) {
    const pendingNull = db.exec(
      "SELECT id FROM notes WHERE board = ? AND status = 'pending' AND sort_order IS NULL ORDER BY created_at DESC, id DESC",
      [board]
    );
    if (!pendingNull.length) continue;
    const ids = pendingNull[0].values.map((row) => row[0] as number);
    db.run('BEGIN');
    const stmt = db.prepare(
      "UPDATE notes SET sort_order = ? WHERE id = ? AND board = ? AND status = 'pending'"
    );
    try {
      for (let i = 0; i < ids.length; i++) stmt.run([i, ids[i], board]);
    } finally {
      stmt.free();
      db.run('COMMIT');
    }
  }

  db.run('UPDATE notes SET sort_order = 0 WHERE sort_order IS NULL');
  db.run("UPDATE note_links SET description = url WHERE description IS NULL OR description = ''");

  try {
    const noteBoards = db.exec(
      "SELECT DISTINCT board FROM notes WHERE board IS NOT NULL AND board <> '' ORDER BY board ASC"
    );
    const names = noteBoards.length ? noteBoards[0].values.map((r) => r[0] as string) : [];
    if (names.length) {
      const existingRes = db.exec('SELECT name FROM boards');
      const existing = new Set(
        existingRes.length
          ? existingRes[0].values.map((r) => String(r[0] || '').toLowerCase()).filter(Boolean)
          : []
      );
      for (const n of names) {
        const s = String(n || '');
        if (!s) continue;
        const k = s.toLowerCase();
        if (existing.has(k)) continue;
        existing.add(k);
        const stmt = db.prepare('INSERT OR IGNORE INTO boards(name, created_at, sort_order) VALUES(?, ?, ?)');
        stmt.run([s, Date.now(), 0]);
        stmt.free();
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const countRes = db.exec('SELECT COUNT(*) FROM boards');
    const count = countRes.length ? Number(countRes[0].values[0][0]) : 0;
    if (!count) {
      const stmt = db.prepare('INSERT OR IGNORE INTO boards(name, created_at, sort_order) VALUES(?, ?, ?)');
      stmt.run([defaultBoard, Date.now(), 0]);
      stmt.free();
    }
  } catch {
    /* ignore */
  }
}
