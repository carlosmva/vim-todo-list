import { describe, expect, it } from 'vitest';
import {
  computeSpotlightRect,
  computeTourPanelPosition,
  cycleTourFocusables,
  GUIDED_TOUR_STEPS,
  guidedTourKeyAction,
  spotlightRadiusFromBorderRadius,
} from './guided-tour.util';

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('guided tour geometry', () => {
  it('pads the spotlight and keeps it inside the viewport', () => {
    const rect = computeSpotlightRect({ left: 40, top: 20, width: 80, height: 40 }, { width: 400, height: 300 });
    expect(rect).toEqual({ x: 32, y: 12, width: 96, height: 56 });
  });

  it('clamps a target that sits on the viewport edge', () => {
    const rect = computeSpotlightRect({ left: 2, top: 2, width: 10, height: 10 }, { width: 200, height: 200 });
    expect(rect.x).toBe(8);
    expect(rect.y).toBe(8);
    expect(rect.width).toBeGreaterThanOrEqual(24);
    expect(rect.height).toBeGreaterThanOrEqual(24);
  });

  it('places the panel below the target when there is room', () => {
    const pos = computeTourPanelPosition(
      { left: 100, top: 40, width: 80, height: 30 },
      { width: 200, height: 80 },
      { width: 400, height: 400 }
    );
    expect(pos.top).toBe(84);
    expect(pos.left).toBeGreaterThanOrEqual(12);
  });

  it('flips the panel above when the target is near the bottom', () => {
    const pos = computeTourPanelPosition(
      { left: 100, top: 320, width: 80, height: 40 },
      { width: 200, height: 90 },
      { width: 400, height: 400 }
    );
    expect(pos.top).toBe(216);
  });

  it('clamps border-radius derived spotlight corners', () => {
    expect(spotlightRadiusFromBorderRadius(0)).toBe(8);
    expect(spotlightRadiusFromBorderRadius(4)).toBe(12);
    expect(spotlightRadiusFromBorderRadius(40)).toBe(18);
  });
});

describe('guidedTourKeyAction', () => {
  it('closes on Escape', () => {
    expect(guidedTourKeyAction(key({ key: 'Escape' }), 'qwerty', 'winlinux')).toEqual({ type: 'close' });
  });

  it('advances and goes back with the nav modifier', () => {
    expect(guidedTourKeyAction(key({ key: 'l', altKey: true }), 'qwerty', 'winlinux')).toEqual({ type: 'next' });
    expect(guidedTourKeyAction(key({ key: 'k', altKey: true }), 'qwerty', 'winlinux')).toEqual({ type: 'next' });
    expect(guidedTourKeyAction(key({ key: 'j', altKey: true }), 'qwerty', 'winlinux')).toEqual({ type: 'back' });
    expect(guidedTourKeyAction(key({ key: 'i', altKey: true }), 'qwerty', 'winlinux')).toEqual({ type: 'back' });
  });

  it('moves focus with arrows and bare nav keys', () => {
    expect(guidedTourKeyAction(key({ key: 'ArrowRight' }), 'qwerty', 'winlinux')).toEqual({
      type: 'move',
      direction: 'right',
    });
    expect(guidedTourKeyAction(key({ key: 'l' }), 'qwerty', 'winlinux')).toEqual({ type: 'move', direction: 'right' });
    expect(guidedTourKeyAction(key({ key: 'j' }), 'qwerty', 'winlinux')).toEqual({ type: 'move', direction: 'left' });
    expect(guidedTourKeyAction(key({ key: 'n' }), 'dvorak', 'winlinux')).toEqual({ type: 'move', direction: 'right' });
  });

  it('activates the focused control on Enter or Space', () => {
    expect(guidedTourKeyAction(key({ key: 'Enter' }), 'qwerty', 'winlinux')).toEqual({ type: 'activate' });
    expect(guidedTourKeyAction(key({ key: ' ' }), 'qwerty', 'winlinux')).toEqual({ type: 'activate' });
  });

  it('maps Tab for focus cycling', () => {
    expect(guidedTourKeyAction(key({ key: 'Tab' }), 'qwerty', 'winlinux')).toEqual({ type: 'cycle', delta: 1 });
    expect(guidedTourKeyAction(key({ key: 'Tab', shiftKey: true }), 'qwerty', 'winlinux')).toEqual({
      type: 'cycle',
      delta: -1,
    });
  });
});

describe('GUIDED_TOUR_STEPS', () => {
  it('covers notes then each settings section', () => {
    expect(GUIDED_TOUR_STEPS[0]?.view).toBe('notes');
    expect(GUIDED_TOUR_STEPS.map((step) => step.section).filter(Boolean)).toEqual([
      'boards',
      'boards',
      'appearance',
      'data',
      'ai',
      'obsidian',
      'keyboard',
    ]);
  });
});

describe('cycleTourFocusables', () => {
  it('skips disabled buttons and wraps', () => {
    const skip = document.createElement('button');
    const back = document.createElement('button');
    back.disabled = true;
    const next = document.createElement('button');
    document.body.append(skip, back, next);
    next.focus();
    expect(cycleTourFocusables([skip, back, next], 1)).toBe(skip);
    skip.focus();
    expect(cycleTourFocusables([skip, back, next], -1)).toBe(next);
    skip.remove();
    back.remove();
    next.remove();
  });
});
