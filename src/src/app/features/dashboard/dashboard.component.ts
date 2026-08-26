import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService, DashboardStats } from '../../core/services/dashboard.service';
import { DatabaseService } from '../../core/services/database.service';

interface HeatmapCell {
  count: number;
  level: number;
  label: string;
}

interface HeatmapModel {
  months: string[];
  cells: HeatmapCell[];
  todayWeek: number;
  todayLabel: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
})export class DashboardComponent implements OnInit {
  private readonly dbService = inject(DatabaseService);
  private readonly dashboard = inject(DashboardService);

  stats = signal<DashboardStats | null>(null);
  selectedBoard = signal('');
  readonly pendingHeatmap = computed(() => this.buildHeatmap(this.stats()?.pendingActivity ?? {}, 'Pending due'));
  readonly completeHeatmap = computed(() => this.buildHeatmap(this.stats()?.completeActivity ?? {}, 'Completed due'));

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    const db = this.dbService.getDb();
    this.stats.set(this.dashboard.queryStats(db, this.selectedBoard()));
  }

  selectBoard(board: string): void {
    this.selectedBoard.set(board);
    this.refresh();
  }

  totalPending(): number {
    const s = this.stats();
    return s ? this.dashboard.totalForGrid(s.pending) : 0;
  }

  totalComplete(): number {
    const s = this.stats();
    return s ? this.dashboard.totalForGrid(s.complete) : 0;
  }

  scopeLabel(): string {
    return this.selectedBoard() || 'All';
  }

  boardFilters(): { board: string; label: string }[] {
    const boards = this.stats()?.boards ?? [];
    return [{ board: '', label: 'All tabs' }, ...boards.map((b) => ({ board: b, label: b }))];
  }

  activityDays(map: Record<string, number>): number {
    return Object.keys(map || {}).length;
  }

  private buildHeatmap(counts: Record<string, number>, title: string): HeatmapModel {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 25 * 7 - start.getDay());

    const weekCount = 51;
    const max = Math.max(1, ...Object.values(counts).map((count) => Number(count) || 0));
    const months = Array.from({ length: weekCount }, () => '');
    const cells: HeatmapCell[] = [];
    let previousMonth = -1;

    for (let week = 0; week < weekCount; week++) {
      const weekStart = new Date(start);
      weekStart.setDate(start.getDate() + week * 7);
      if (weekStart.getMonth() !== previousMonth) {
        months[week] = weekStart.toLocaleString(undefined, { month: 'short' });
        previousMonth = weekStart.getMonth();
      }

      for (let day = 0; day < 7; day++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + day);
        const count = Number(counts[this.localDateKey(date)] || 0);
        const level = count <= 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
        const formatted = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        cells.push({ count, level, label: `${count} ${title.toLowerCase()} ${formatted}` });
      }
    }

    const todayWeek = Math.floor((today.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return {
      months,
      cells,
      todayWeek,
      todayLabel: today.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    };
  }

  private localDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
