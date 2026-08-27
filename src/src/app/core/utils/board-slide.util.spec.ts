import { describe, expect, it } from 'vitest';
import { boardSlideDirection } from './board-slide.util';

describe('boardSlideDirection', () => {
  it('slides left when moving to a later tab', () => {
    expect(boardSlideDirection(0, 1)).toBe('left');
    expect(boardSlideDirection(1, 3)).toBe('left');
  });

  it('slides right when moving to an earlier tab', () => {
    expect(boardSlideDirection(2, 0)).toBe('right');
  });

  it('returns null when the tab does not change', () => {
    expect(boardSlideDirection(1, 1)).toBeNull();
    expect(boardSlideDirection(-1, 0)).toBeNull();
  });
});
