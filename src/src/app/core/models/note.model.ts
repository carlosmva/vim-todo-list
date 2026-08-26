export type NoteStatus = 'pending' | 'complete';
export type NotePriority = 'low' | 'normal' | 'high';

export interface Note {
  id: number;
  text: string;
  status: NoteStatus;
  priority: NotePriority;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  notes_html: string;
  sort_order: number;
  board: string;
  due_at: number | null;
}

export interface NoteLink {
  id: number;
  url: string;
  description: string | null;
  created_at: number;
}

export function normalizePriority(value: unknown): NotePriority {
  const v = String(value ?? '').toLowerCase().trim();
  if (v === 'high' || v === 'low' || v === 'normal') return v;
  return 'normal';
}

export function nextPriority(current: unknown): NotePriority {
  const cur = normalizePriority(current);
  if (cur === 'low') return 'normal';
  if (cur === 'normal') return 'high';
  return 'low';
}

export function formatPriorityLabel(p: unknown): string {
  const v = normalizePriority(p);
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export function formatDueDate(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
