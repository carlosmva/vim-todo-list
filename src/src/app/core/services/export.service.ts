import { Injectable } from '@angular/core';
import type { Database } from 'sql.js';
import { DatabaseService } from './database.service';

@Injectable({ providedIn: 'root' })
export class ExportService {
  constructor(private readonly dbService: DatabaseService) {}

  exportDbFile(): void {
    void this.dbService.persist().finally(() => {
      const bytes = this.dbService.exportBytes();
      const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      a.href = url;
      a.download = `notes-kanban-${yyyy}-${mm}-${dd}.sqlite`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }

  exportCsv(db: Database): void {
    const res = db.exec(
      `SELECT n.id, n.text, n.status, n.priority, n.board, n.created_at, n.updated_at, n.completed_at, n.due_at, n.notes_html
       FROM notes n ORDER BY n.board ASC, n.status ASC, n.sort_order ASC, n.id ASC`
    );
    if (!res.length) {
      this.downloadCsv('id,text,status,priority,board,created_at,updated_at,completed_at,due_at,notes_html\n');
      return;
    }
    const { columns, values } = res[0];
    const header = columns.join(',');
    const rows = values.map((row) =>
      row
        .map((cell, i) => {
          const col = columns[i];
          if (col === 'due_at' && cell != null) return this.formatCsvDate(Number(cell));
          if (col === 'created_at' || col === 'updated_at' || col === 'completed_at') {
            return cell != null ? this.formatCsvDateTime(Number(cell)) : '';
          }
          if (col === 'notes_html') return this.escapeCsv(this.htmlToPlain(String(cell ?? '')));
          return this.escapeCsv(String(cell ?? ''));
        })
        .join(',')
    );
    this.downloadCsv([header, ...rows].join('\n'));
  }

  private formatCsvDate(ts: number): string {
    const d = new Date(ts);
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${mm}/${dd}/${d.getUTCFullYear()}`;
  }

  private formatCsvDateTime(ts: number): string {
    const d = new Date(ts);
    return d.toISOString();
  }

  private htmlToPlain(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || '').trim();
  }

  private escapeCsv(value: string): string {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  }

  private downloadCsv(content: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `notes-kanban-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
