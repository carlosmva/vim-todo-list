import { Injectable } from '@angular/core';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { ChromeStorageService } from './chrome-storage.service';
import { ensureSchema } from '../utils/schema.util';
import { DEFAULT_BOARD } from '../models/envelope.model';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private sql: SqlJsStatic | null = null;
  private db: Database | null = null;

  constructor(private readonly storage: ChromeStorageService) {}

  async init(): Promise<Database> {
    if (this.db) return this.db;
    this.sql = await initSqlJs({
      locateFile: (file) => chrome.runtime.getURL(`vendor/${file}`),
    });
    const bytes = this.storage.getDbBytes();
    this.db = bytes ? new this.sql.Database(bytes) : new this.sql.Database();
    ensureSchema(this.db, DEFAULT_BOARD);
    return this.db;
  }

  getDb(): Database {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  async persist(): Promise<void> {
    if (!this.db) return;
    this.storage.setDbBytes(this.db.export());
    await this.storage.flush();
  }

  async importBytes(bytes: Uint8Array): Promise<void> {
    if (!this.sql) throw new Error('SQL.js not initialized');
    this.db?.close();
    this.db = new this.sql.Database(bytes);
    ensureSchema(this.db, DEFAULT_BOARD);
    await this.persist();
  }

  exportBytes(): Uint8Array {
    return this.getDb().export();
  }

  getSetting(key: string): string | null {
    const res = this.getDb().exec('SELECT value FROM app_settings WHERE key = ?', [key]);
    if (!res.length || !res[0].values.length) return null;
    return String(res[0].values[0][0] ?? '');
  }

  setSetting(key: string, value: string): void {
    const now = Date.now();
    this.getDb().run(
      'INSERT INTO app_settings(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [key, value, now]
    );
  }
}
