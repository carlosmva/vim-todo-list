import { describe, expect, it } from 'vitest';
import type { Note } from '../models/note.model';
import {
  cycleFocusModeButtons,
  focusModeKeyAction,
  focusPendingQueue,
  focusTodayProgress,
  formatElapsed,
  formatFocusDue,
  isCompletedToday,
  isDueToday,
  nextFocusNote,
  utcDateKey,
} from './focus-mode.util';

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 1,
    text: 'Task',
    status: 'pending',
    priority: 'normal',
    created_at: 1,
    updated_at: 1,
    completed_at: null,
    notes_html: '',
    sort_order: 0,
    board: 'Work',
    due_at: null,
    ...overrides,
  };
}

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('focus mode dates', () => {
  it('treats UTC midnight dues as due today', () => {
    const now = Date.UTC(2026, 7, 26, 15, 0, 0);
    const due = Date.UTC(2026, 7, 26);
    expect(isDueToday(due, now)).toBe(true);
    expect(isDueToday(Date.UTC(2026, 7, 25), now)).toBe(false);
    expect(isDueToday(null, now)).toBe(false);
  });

  it('treats local completed_at as completed today', () => {
    const now = new Date(2026, 7, 26, 21, 0, 0).getTime();
    expect(isCompletedToday(now - 60_000, now)).toBe(true);
    expect(isCompletedToday(now - 48 * 60 * 60 * 1000, now)).toBe(false);
  });

  it('formats UTC due labels like the board', () => {
    expect(formatFocusDue(Date.UTC(2026, 7, 26))).toBe('Due Aug 26');
    expect(formatFocusDue(null)).toBe('');
  });
});

describe('focus queue and progress', () => {
  it('prefers pending tasks due today', () => {
    const now = Date.UTC(2026, 7, 26, 15, 0, 0);
    const notes = [
      note({ id: 1, text: 'Later', due_at: Date.UTC(2026, 7, 28) }),
      note({ id: 2, text: 'Today', due_at: Date.UTC(2026, 7, 26) }),
      note({ id: 3, status: 'complete', due_at: Date.UTC(2026, 7, 26), completed_at: now }),
    ];
    expect(focusPendingQueue(notes, now).map((n) => n.id)).toEqual([2]);
  });

  it('falls back to all pending when nothing is due today', () => {
    const now = Date.now();
    const notes = [note({ id: 1 }), note({ id: 2, status: 'complete', completed_at: now })];
    expect(focusPendingQueue(notes, now).map((n) => n.id)).toEqual([1]);
  });

  it('counts completed today against remaining work', () => {
    const now = Date.now();
    const todayUtc = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
    const notes = [
      note({ id: 1, due_at: todayUtc }),
      note({ id: 2, due_at: todayUtc }),
      note({
        id: 3,
        status: 'complete',
        due_at: todayUtc,
        completed_at: now,
      }),
    ];
    expect(focusTodayProgress(notes, now)).toEqual({
      done: 1,
      remaining: 2,
      total: 3,
      usesDueToday: true,
    });
  });

  it('advances to the next queued task and stops at the end', () => {
    const queue = [note({ id: 1 }), note({ id: 2 }), note({ id: 3 })];
    expect(nextFocusNote(queue, 2)?.id).toBe(3);
    expect(nextFocusNote(queue, 3)).toBeNull();
    expect(nextFocusNote(queue, 99)?.id).toBe(1);
    expect(nextFocusNote([], 1)).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('formats minutes and hours', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(12_000)).toBe('0:12');
    expect(formatElapsed(75_000)).toBe('1:15');
    expect(formatElapsed(3_661_000)).toBe('1:01:01');
  });
});

describe('focusModeKeyAction', () => {
  it('closes on Escape and cycles with Tab', () => {
    expect(focusModeKeyAction(key({ key: 'Escape' }))).toEqual({ type: 'close' });
    expect(focusModeKeyAction(key({ key: 'Tab' }))).toEqual({ type: 'cycle', delta: 1 });
    expect(focusModeKeyAction(key({ key: 'Tab', shiftKey: true }))).toEqual({ type: 'cycle', delta: -1 });
  });

  it('activates Complete and Notes from letter keys', () => {
    expect(focusModeKeyAction(key({ key: 'Enter' }))).toEqual({ type: 'activate' });
    expect(focusModeKeyAction(key({ key: 'c' }))).toEqual({ type: 'complete' });
    expect(focusModeKeyAction(key({ key: 'n' }))).toEqual({ type: 'notes' });
    expect(focusModeKeyAction(key({ key: 'c', ctrlKey: true }))).toBeNull();
  });
});

describe('cycleFocusModeButtons', () => {
  it('wraps between enabled buttons', () => {
    document.body.innerHTML = `<button id="a">A</button><button id="b" disabled>B</button><button id="c">C</button>`;
    const a = document.getElementById('a') as HTMLButtonElement;
    const c = document.getElementById('c') as HTMLButtonElement;
    a.focus();
    expect(cycleFocusModeButtons([a, document.getElementById('b') as HTMLButtonElement, c], 1)).toBe(c);
    c.focus();
    expect(cycleFocusModeButtons([a, c], 1)).toBe(a);
    document.body.innerHTML = '';
  });
});

describe('utcDateKey', () => {
  it('is stable for UTC midnight values', () => {
    expect(utcDateKey(Date.UTC(2026, 7, 26))).toBe('2026-08-26');
  });
});
