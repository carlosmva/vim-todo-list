import type { NotePriority } from './note.model';

export const PRIORITY_RIBBON_LIMITS = [3, 5, 10] as const;
export type PriorityRibbonLimit = (typeof PRIORITY_RIBBON_LIMITS)[number];

export const DEFAULT_PRIORITY_RIBBON_LIMIT: PriorityRibbonLimit = 5;

export interface PriorityRibbonNote {
  id: number;
  text: string;
  board: string;
  priority: NotePriority;
  due_at: number | null;
}

export function parsePriorityRibbonLimit(value: unknown): PriorityRibbonLimit {
  const n = Number(value);
  if (n === 3 || n === 5 || n === 10) return n;
  return DEFAULT_PRIORITY_RIBBON_LIMIT;
}
