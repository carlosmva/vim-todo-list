export const CALENDAR_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const CALENDAR_MONTH_COUNT = 4;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface CalendarDayCell {
  ts: number;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

export interface CalendarMonth {
  offset: number;
  year: number;
  month: number;
  title: string;
  shortTitle: string;
  days: CalendarDayCell[];
  weeks: CalendarDayCell[][];
}

export function utcTodayStart(now = Date.now()): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function mondayWeekIndex(sundayIndexedDay: number): number {
  return (sundayIndexedDay + 6) % 7;
}

export function monthTitle(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

export function buildMonthGrid(year: number, month: number, todayTs = utcTodayStart()): CalendarDayCell[] {
  const firstTs = Date.UTC(year, month, 1);
  const lead = mondayWeekIndex(new Date(firstTs).getUTCDay());
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const prevMonthLast = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: CalendarDayCell[] = [];

  for (let i = lead; i > 0; i -= 1) {
    const day = prevMonthLast - i + 1;
    const ts = Date.UTC(year, month - 1, day);
    cells.push({ ts, day, inMonth: false, isToday: ts === todayTs });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const ts = Date.UTC(year, month, day);
    cells.push({ ts, day, inMonth: true, isToday: ts === todayTs });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const ts = Date.UTC(year, month + 1, nextDay);
    cells.push({ ts, day: nextDay, inMonth: false, isToday: ts === todayTs });
    nextDay += 1;
  }
  return cells;
}

export function chunkWeeks(days: CalendarDayCell[]): CalendarDayCell[][] {
  const weeks: CalendarDayCell[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function buildCalendarMonths(now = Date.now()): CalendarMonth[] {
  const today = new Date(now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const todayTs = utcTodayStart(now);
  const months: CalendarMonth[] = [];
  for (let offset = 0; offset < CALENDAR_MONTH_COUNT; offset += 1) {
    const ts = Date.UTC(year, month + offset, 1);
    const date = new Date(ts);
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    const days = buildMonthGrid(y, m, todayTs);
    months.push({
      offset,
      year: y,
      month: m,
      title: monthTitle(y, m),
      shortTitle: MONTH_NAMES[m].slice(0, 3),
      days,
      weeks: chunkWeeks(days),
    });
  }
  return months;
}

export function calendarQueryRange(now = Date.now()): { startTs: number; endTs: number } {
  const today = new Date(now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  return {
    startTs: Date.UTC(year, month, 1) - 7 * 86400000,
    endTs: Date.UTC(year, month + CALENDAR_MONTH_COUNT, 8),
  };
}

export function formatSidebarHeading(ts: number): { weekday: string; monthDay: string } {
  const date = new Date(ts);
  return {
    weekday: WEEKDAY_NAMES[date.getUTCDay()],
    monthDay: `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`,
  };
}

export function taskCountLabel(count: number, isToday: boolean): string {
  if (count <= 0) return '';
  if (isToday) return count === 1 ? '1 item' : `${count} items`;
  return String(count);
}
