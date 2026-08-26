import { describe, expect, it } from 'vitest';
import { obsidianConflictKeyAction } from './obsidian-conflict-keys.util';

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('obsidianConflictKeyAction', () => {
  it('maps 1 / 2 / Escape', () => {
    expect(obsidianConflictKeyAction(key({ key: '1' }), 'qwerty', 'winlinux')).toEqual({
      type: 'resolve',
      choice: 'app',
    });
    expect(obsidianConflictKeyAction(key({ key: '2' }), 'qwerty', 'winlinux')).toEqual({
      type: 'resolve',
      choice: 'vault',
    });
    expect(obsidianConflictKeyAction(key({ key: 'Escape' }), 'qwerty', 'winlinux')).toEqual({ type: 'cancel' });
  });

  it('maps Enter to activate and Tab to cycle', () => {
    expect(obsidianConflictKeyAction(key({ key: 'Enter' }), 'qwerty', 'winlinux')).toEqual({ type: 'activate' });
    expect(obsidianConflictKeyAction(key({ key: 'Tab', shiftKey: true }), 'qwerty', 'winlinux')).toEqual({
      type: 'cycle',
      delta: -1,
    });
  });

  it('maps QWERTY IJKL and arrows to move', () => {
    expect(obsidianConflictKeyAction(key({ key: 'j' }), 'qwerty', 'winlinux')).toEqual({
      type: 'move',
      direction: 'left',
    });
    expect(obsidianConflictKeyAction(key({ key: 'l' }), 'qwerty', 'winlinux')).toEqual({
      type: 'move',
      direction: 'right',
    });
    expect(obsidianConflictKeyAction(key({ key: 'ArrowUp' }), 'qwerty', 'winlinux')).toEqual({
      type: 'move',
      direction: 'up',
    });
  });

  it('maps Dvorak CHNT with Alt on Windows', () => {
    expect(obsidianConflictKeyAction(key({ key: 'h', altKey: true }), 'dvorak', 'winlinux')).toEqual({
      type: 'move',
      direction: 'left',
    });
  });
});
