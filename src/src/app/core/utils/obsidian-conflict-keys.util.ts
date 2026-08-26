import {
  getNavKeys,
  modKeyActive,
  modKeyOnly,
  type KeyboardLayout,
  type KeyboardNavPlatform,
  type NavKeys,
} from '../keyboard/keyboard.model';

export type ObsidianConflictKeyAction =
  | { type: 'resolve'; choice: 'app' | 'vault' }
  | { type: 'cancel' }
  | { type: 'activate' }
  | { type: 'move'; direction: 'left' | 'right' | 'up' | 'down' }
  | { type: 'cycle'; delta: 1 | -1 };

function arrowDirection(raw: string, code: string): 'left' | 'right' | 'up' | 'down' | null {
  if (raw === 'ArrowLeft' || code === 'ArrowLeft') return 'left';
  if (raw === 'ArrowRight' || code === 'ArrowRight') return 'right';
  if (raw === 'ArrowUp' || code === 'ArrowUp') return 'up';
  if (raw === 'ArrowDown' || code === 'ArrowDown') return 'down';
  return null;
}

function navDirection(key: string, nav: NavKeys): 'left' | 'right' | 'up' | 'down' | null {
  if (key === nav.left) return 'left';
  if (key === nav.right) return 'right';
  if (key === nav.up) return 'up';
  if (key === nav.down) return 'down';
  return null;
}

/** Map a keydown to a conflict-modal action. Returns null when the event should pass through. */
export function obsidianConflictKeyAction(
  event: KeyboardEvent,
  layout: KeyboardLayout,
  platform: KeyboardNavPlatform
): ObsidianConflictKeyAction | null {
  const raw = event.key;
  const code = event.code || '';
  const key = (raw || '').toLowerCase();
  const nav = getNavKeys(layout);

  if (raw === 'Escape') return { type: 'cancel' };

  const digit =
    raw === '1' || raw === '2'
      ? raw
      : code === 'Digit1' || code === 'Numpad1'
        ? '1'
        : code === 'Digit2' || code === 'Numpad2'
          ? '2'
          : '';
  if (digit === '1' || digit === '2') {
    if (modKeyActive(event, platform) || event.ctrlKey || event.metaKey) return null;
    return { type: 'resolve', choice: digit === '1' ? 'app' : 'vault' };
  }

  if (raw === 'Tab') return { type: 'cycle', delta: event.shiftKey ? -1 : 1 };

  if (raw === 'Enter' || raw === ' ') return { type: 'activate' };

  const arrow = arrowDirection(raw, code);
  if (arrow) return { type: 'move', direction: arrow };

  const navMove = navDirection(key, nav);
  if (navMove) {
    if (event.metaKey) return null;
    if (modKeyActive(event, platform)) {
      return modKeyOnly(event, platform) ? { type: 'move', direction: navMove } : null;
    }
    if (event.ctrlKey || event.altKey) return null;
    return { type: 'move', direction: navMove };
  }

  return null;
}

export function conflictChoiceButtons(): HTMLElement[] {
  return [
    document.getElementById('obsidianConflictUseApp'),
    document.getElementById('obsidianConflictUseVault'),
    document.getElementById('obsidianConflictCancel'),
  ].filter((el): el is HTMLElement => el instanceof HTMLElement);
}

export function isObsidianConflictModalOpen(): boolean {
  return !!document.getElementById('obsidianConflictModal');
}
