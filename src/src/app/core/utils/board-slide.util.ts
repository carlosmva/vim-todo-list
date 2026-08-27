export type BoardSlideDirection = 'left' | 'right';

/** Content slides toward the previous tab: later tab → leave left / enter from right. */
export function boardSlideDirection(fromIndex: number, toIndex: number): BoardSlideDirection | null {
  if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) return null;
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null;
  return toIndex > fromIndex ? 'left' : 'right';
}
