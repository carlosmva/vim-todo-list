import { describe, expect, it } from 'vitest';
import {
  buildCalendarMonths,
  buildMonthGrid,
  calendarQueryRange,
  formatSidebarHeading,
  mondayWeekIndex,
  taskCountLabel,
} from './calendar-view.util';

describe('calendar-view.util', () => {
  it('maps Sunday-indexed weekdays onto a Monday-first grid', () => {
    expect(mondayWeekIndex(1)).toBe(0);
    expect(mondayWeekIndex(0)).toBe(6);
  });

  it('pads a month with adjacent days and completes the last week', () => {
    const days = buildMonthGrid(2017, 0, Date.UTC(2017, 0, 15));
    expect(days[0]).toMatchObject({ day: 26, inMonth: false });
    expect(days[6]).toMatchObject({ day: 1, inMonth: true });
    expect(days.at(-1)?.inMonth).toBe(false);
    expect(days.length % 7).toBe(0);
    expect(days.find((day) => day.isToday)?.day).toBe(15);
  });

  it('builds the current month plus three ahead', () => {
    const months = buildCalendarMonths(Date.UTC(2026, 8, 6));
    expect(months).toHaveLength(4);
    expect(months.map((month) => month.title)).toEqual([
      'September 2026',
      'October 2026',
      'November 2026',
      'December 2026',
    ]);
  });

  it('formats the sidebar heading and today count copy', () => {
    expect(formatSidebarHeading(Date.UTC(2017, 3, 6))).toEqual({
      weekday: 'Thursday',
      monthDay: 'April 6',
    });
    expect(taskCountLabel(4, true)).toBe('4 items');
    expect(taskCountLabel(2, false)).toBe('2');
    expect(taskCountLabel(0, true)).toBe('');
  });

  it('queries a window wide enough for adjacent-month cells', () => {
    const range = calendarQueryRange(Date.UTC(2026, 8, 6));
    expect(range.startTs).toBeLessThan(Date.UTC(2026, 8, 1));
    expect(range.endTs).toBeGreaterThan(Date.UTC(2026, 11, 31));
  });
});
