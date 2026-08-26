import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NotesRepository } from '../../core/services/notes.repository';
import { AppStateService } from '../../core/services/app-state.service';
import { Note, formatDueDate } from '../../core/models/note.model';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
})
export class CalendarComponent implements OnInit {
  private readonly repo = inject(NotesRepository);
  private readonly state = inject(AppStateService);
  private readonly router = inject(Router);
  readonly weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  months = signal<{ title: string; days: (number | null)[] }[]>([]);
  byDate = signal<Map<string, Note[]>>(new Map());
  selectedDay = signal<number | null>(null);
  selectedTasks = signal<Note[]>([]);

  ngOnInit(): void {
    this.render();
  }

  render(): void {
    const now = new Date();
    const startTs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const endTs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1);
    const notes = this.repo.queryNotesByDueRange(startTs, endTs);
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      const key = String(n.due_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    this.byDate.set(map);

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const months: { title: string; days: (number | null)[] }[] = [];
    for (let monthIdx = 0; monthIdx < 2; monthIdx++) {
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() + monthIdx;
      const adj = Math.floor(m / 12);
      const year = y + adj;
      const month = ((m % 12) + 12) % 12;
      const first = new Date(Date.UTC(year, month, 1));
      const last = new Date(Date.UTC(year, month + 1, 0));
      const firstDay = first.getUTCDay();
      const daysInMonth = last.getUTCDate();
      const days: (number | null)[] = [];
      for (let i = 0; i < firstDay; i++) days.push(null);
      for (let d = 1; d <= daysInMonth; d++) {
        days.push(Date.UTC(year, month, d));
      }
      months.push({ title: `${monthNames[month]} ${year}`, days });
    }
    this.months.set(months);

    const currentSelectedDay = this.selectedDay();
    if (currentSelectedDay && map.has(String(currentSelectedDay))) {
      this.selectDay(currentSelectedDay);
      return;
    }

    const firstDayWithTasks = months
      .flatMap((month) => month.days)
      .find((day): day is number => day !== null && (map.get(String(day))?.length ?? 0) > 0);

    if (firstDayWithTasks) {
      this.selectDay(firstDayWithTasks);
      return;
    }

    this.selectedDay.set(null);
    this.selectedTasks.set([]);
  }

  tasksForDay(ts: number): Note[] {
    return this.byDate().get(String(ts)) ?? [];
  }

  selectDay(ts: number): void {
    this.selectedDay.set(ts);
    this.selectedTasks.set(this.tasksForDay(ts));
  }

  dayNum(ts: number): number {
    return new Date(ts).getUTCDate();
  }

  calendarRow(cellIndex: number): number {
    return Math.floor(cellIndex / 7);
  }

  calendarColumn(cellIndex: number): number {
    return cellIndex % 7;
  }

  focusFirstTask(ts: number, event: Event): void {
    if (!this.tasksForDay(ts).length) return;
    event.preventDefault();
    document.querySelector<HTMLButtonElement>('.calendarTaskLink')?.focus();
  }

  selectedLabel(): string {
    const ts = this.selectedDay();
    if (!ts) return 'Select a day';
    const d = new Date(ts);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  }

  goToNote(note: Note): void {
    this.state.setActiveBoard(note.board);
    void this.router.navigate(['/'], { queryParams: { noteId: note.id } });
  }

  formatDue = formatDueDate;
}
