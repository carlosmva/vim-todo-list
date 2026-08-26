import { Injectable } from '@angular/core';
import type { Database } from 'sql.js';
import { normalizePriority } from '../models/note.model';

export interface DashboardStats {
  pending: Record<string, { low: number; normal: number; high: number }>;
  complete: Record<string, { low: number; normal: number; high: number }>;
  pendingActivity: Record<string, number>;
  completeActivity: Record<string, number>;
  boards: string[];
  oldestPending: number | null;
  newestCreated: number | null;
  recentlyCompleted: number | null;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  queryStats(db: Database, boardFilter = ''): DashboardStats {
    const selectedBoard = String(boardFilter || '').trim();
    const stats: DashboardStats = {
      pending: {},
      complete: {},
      pendingActivity: {},
      completeActivity: {},
      boards: [],
      oldestPending: null,
      newestCreated: null,
      recentlyCompleted: null,
    };

    try {
      const boardsRes = db.exec(
        'SELECT name FROM boards ORDER BY sort_order ASC, created_at ASC, name ASC'
      );
      if (boardsRes.length) {
        stats.boards = (boardsRes[0].values || [])
          .map((row) => String(row[0] || '').trim())
          .filter(Boolean);
      }

      const gridRes = db.exec(
        `SELECT board, priority, status, COUNT(*) AS cnt
         FROM notes
         WHERE board IS NOT NULL AND board <> ''
           AND (? = '' OR board = ?)
         GROUP BY board, priority, status`,
        [selectedBoard, selectedBoard]
      );
      if (gridRes.length) {
        const boardsSet = new Set<string>();
        for (const row of gridRes[0].values || []) {
          const board = String(row[0] || '').trim();
          const priority = normalizePriority(row[1]);
          const status = String(row[2] || '').toLowerCase();
          const cnt = Number(row[3]) || 0;
          if (!board) continue;
          boardsSet.add(board);
          const target = status === 'complete' ? stats.complete : stats.pending;
          if (!target[board]) target[board] = { low: 0, normal: 0, high: 0 };
          target[board][priority] = cnt;
        }
        if (!stats.boards.length) stats.boards = [...boardsSet].sort();
      }

      const oldestRes = db.exec(
        "SELECT created_at FROM notes WHERE status = 'pending' AND (? = '' OR board = ?) ORDER BY created_at ASC LIMIT 1",
        [selectedBoard, selectedBoard]
      );
      if (oldestRes.length && oldestRes[0].values?.[0]?.[0] != null) {
        stats.oldestPending = Number(oldestRes[0].values[0][0]);
      }

      const newestRes = db.exec(
        "SELECT created_at FROM notes WHERE (? = '' OR board = ?) ORDER BY created_at DESC LIMIT 1",
        [selectedBoard, selectedBoard]
      );
      if (newestRes.length && newestRes[0].values?.[0]?.[0] != null) {
        stats.newestCreated = Number(newestRes[0].values[0][0]);
      }

      const completedRes = db.exec(
        "SELECT completed_at FROM notes WHERE completed_at IS NOT NULL AND (? = '' OR board = ?) ORDER BY completed_at DESC LIMIT 1",
        [selectedBoard, selectedBoard]
      );
      if (completedRes.length && completedRes[0].values?.[0]?.[0] != null) {
        stats.recentlyCompleted = Number(completedRes[0].values[0][0]);
      }

      const activityRes = db.exec(
        `SELECT status, due_at FROM notes WHERE due_at IS NOT NULL AND (? = '' OR board = ?)`,
        [selectedBoard, selectedBoard]
      );
      if (activityRes.length) {
        for (const row of activityRes[0].values || []) {
          const status = String(row[0] || '').toLowerCase();
          const dueAt = Number(row[1]);
          if (!Number.isFinite(dueAt)) continue;
          const key = this.localDateKey(dueAt);
          if (status === 'pending') {
            stats.pendingActivity[key] = (stats.pendingActivity[key] || 0) + 1;
          }
          if (status === 'complete') {
            stats.completeActivity[key] = (stats.completeActivity[key] || 0) + 1;
          }
        }
      }
    } catch {
      /* ignore */
    }

    return stats;
  }

  totalForGrid(grid: DashboardStats['pending']): number {
    return Object.values(grid || {}).reduce(
      (sum, row) => sum + row.low + row.normal + row.high,
      0
    );
  }

  private localDateKey(ts: number): string {
    const d = new Date(Number(ts));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
