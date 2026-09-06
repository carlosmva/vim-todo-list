import { Component, Injector, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NotesRepository } from '../../core/services/notes.repository';
import { AppStateService } from '../../core/services/app-state.service';
import { Note } from '../../core/models/note.model';
import {
  CALENDAR_MONTH_COUNT,
  CALENDAR_WEEKDAY_LABELS,
  buildCalendarMonths,
  calendarQueryRange,
  formatSidebarHeading,
  taskCountLabel,
  type CalendarDayCell,
  type CalendarMonth,
} from '../../core/utils/calendar-view.util';

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
  private readonly injector = inject(Injector);

  readonly weekdayLabels = CALENDAR_WEEKDAY_LABELS;
  readonly months = signal<CalendarMonth[]>([]);
  readonly monthOffset = signal(0);
  readonly byDate = signal<Map<string, Note[]>>(new Map());
  readonly selectedDay = signal<number | null>(null);

  readonly visibleMonth = computed(() => this.months()[this.monthOffset()] ?? this.months()[0] ?? null);
  readonly selectedTasks = computed(() => {
    const ts = this.selectedDay();
    return ts == null ? [] : this.tasksForDay(ts);
  });
  readonly selectedHeading = computed(() => {
    const ts = this.selectedDay();
    return ts == null ? { weekday: 'Select a day', monthDay: '' } : formatSidebarHeading(ts);
  });

  ngOnInit(): void {
    this.render();
  }

  render(): void {
    const now = Date.now();
    const range = calendarQueryRange(now);
    const notes = this.repo.queryNotesByDueRange(range.startTs, range.endTs);
    const map = new Map<string, Note[]>();
    for (const note of notes) {
      const key = String(note.due_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(note);
    }
    this.byDate.set(map);
    const months = buildCalendarMonths(now);
    this.months.set(months);

    const currentSelected = this.selectedDay();
    if (currentSelected && map.has(String(currentSelected))) {
      this.selectDay(currentSelected);
      return;
    }

    const todayCell = months.flatMap((month) => month.days).find((day) => day.isToday && day.inMonth);
    if (todayCell) {
      this.selectDay(todayCell.ts);
      return;
    }

    const firstWithTasks = months
      .flatMap((month) => month.days)
      .find((day) => day.inMonth && (map.get(String(day.ts))?.length ?? 0) > 0);
    if (firstWithTasks) {
      this.selectDay(firstWithTasks.ts);
      return;
    }

    this.selectedDay.set(months[0]?.days.find((day) => day.inMonth)?.ts ?? null);
  }

  tasksForDay(ts: number): Note[] {
    return this.byDate().get(String(ts)) ?? [];
  }

  countForDay(cell: CalendarDayCell): number {
    return this.tasksForDay(cell.ts).length;
  }

  countLabel(cell: CalendarDayCell): string {
    return taskCountLabel(this.countForDay(cell), cell.isToday);
  }

  selectDay(ts: number): void {
    this.selectedDay.set(ts);
    if (this.visibleMonth()?.days.some((day) => day.ts === ts)) return;
    const match = this.months().findIndex((month) => month.days.some((day) => day.inMonth && day.ts === ts));
    if (match >= 0) this.monthOffset.set(match);
  }

  showMonth(offset: number, focusDay = true): void {
    const next = Math.max(0, Math.min(CALENDAR_MONTH_COUNT - 1, offset));
    this.monthOffset.set(next);
    const month = this.months()[next];
    if (!month) return;
    const selected = this.selectedDay();
    if (!(selected && month.days.some((day) => day.ts === selected))) {
      const today = month.days.find((day) => day.isToday && day.inMonth);
      const firstWithTasks = month.days.find((day) => day.inMonth && this.countForDay(day) > 0);
      this.selectedDay.set(today?.ts ?? firstWithTasks?.ts ?? month.days.find((day) => day.inMonth)?.ts ?? null);
    }
    if (focusDay) this.focusSelectedDay();
  }

  focusSelectedDay(): void {
    afterNextRender(
      () => {
        document.querySelector<HTMLElement>('.calendarDayCell--selected')?.focus();
      },
      { injector: this.injector }
    );
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

  goToNote(note: Note): void {
    this.state.setActiveBoard(note.board);
    void this.router.navigate(['/'], { queryParams: { noteId: note.id } });
  }

  goToNotes(): void {
    void this.router.navigate(['/']);
  }
}
