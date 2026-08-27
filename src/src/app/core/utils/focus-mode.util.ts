import { formatDueDate } from '../models/note.model';

export interface FocusTodayProgress {
  done: number;
  remaining: number;
  total: number;
  usesDueToday: boolean;
}

export type FocusModeKeyAction =
  | { type: 'close' }
  | { type: 'complete' }
  | { type: 'notes' }
  | { type: 'activate' }
  | { type: 'cycle'; delta: 1 | -1 };

export function utcDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isDueToday(dueAt: number | null | undefined, now: number): boolean {
  if (dueAt == null || !Number.isFinite(dueAt)) return false;
  return utcDateKey(dueAt) === utcDateKey(now);
}

export function isCompletedToday(completedAt: number | null | undefined, now: number): boolean {
  if (completedAt == null || !Number.isFinite(completedAt)) return false;
  return localDateKey(completedAt) === localDateKey(now);
}

export function focusPendingQueue<T extends { status: string; due_at: number | null }>(notes: T[], now: number): T[] {
  const pending = notes.filter((note) => note.status === 'pending');
  const dueToday = pending.filter((note) => isDueToday(note.due_at, now));
  return dueToday.length ? dueToday : pending;
}

export function focusTodayProgress(
  notes: Array<{ status: string; due_at: number | null; completed_at: number | null }>,
  now: number
): FocusTodayProgress {
  const remaining = focusPendingQueue(notes, now).length;
  const usesDueToday = notes.some((note) => note.status === 'pending' && isDueToday(note.due_at, now));
  const done = notes.filter((note) => isCompletedToday(note.completed_at, now)).length;
  return { done, remaining, total: done + remaining, usesDueToday };
}

export function nextFocusNote<T extends { id: number }>(queue: T[], currentId: number): T | null {
  const index = queue.findIndex((note) => note.id === currentId);
  if (index < 0) return queue[0] ?? null;
  return queue[index + 1] ?? null;
}

export function formatElapsed(ms: number): string {
  const elapsed = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSec = Math.floor(elapsed / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

export function formatFocusDue(dueAt: number | null | undefined): string {
  const label = formatDueDate(dueAt);
  return label ? `Due ${label}` : '';
}

export function focusModeKeyAction(event: KeyboardEvent): FocusModeKeyAction | null {
  if (event.ctrlKey || event.metaKey) return null;
  const raw = event.key;
  if (raw === 'Escape') return { type: 'close' };
  if (raw === 'Tab') return { type: 'cycle', delta: event.shiftKey ? -1 : 1 };
  if (raw === 'Enter') return { type: 'activate' };
  if (raw === 'ArrowRight' || raw === 'ArrowDown') return { type: 'cycle', delta: 1 };
  if (raw === 'ArrowLeft' || raw === 'ArrowUp') return { type: 'cycle', delta: -1 };

  if (event.altKey) return null;
  const key = (raw || '').toLowerCase();
  if (key === 'c') return { type: 'complete' };
  if (key === 'n') return { type: 'notes' };
  return null;
}

export function cycleFocusModeButtons(buttons: HTMLButtonElement[], delta: 1 | -1): HTMLButtonElement | null {
  const enabled = buttons.filter((button) => !button.disabled);
  if (!enabled.length) return null;
  const active = document.activeElement;
  const current = enabled.findIndex((button) => button === active || button.contains(active));
  const nextIndex =
    current < 0 ? (delta > 0 ? 0 : enabled.length - 1) : (current + delta + enabled.length) % enabled.length;
  return enabled[nextIndex] ?? null;
}
