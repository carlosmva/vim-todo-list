import {
  getNavKeys,
  modKeyOnly,
  type KeyboardLayout,
  type KeyboardNavPlatform,
} from '../keyboard/keyboard.model';
import type { SettingsTabId } from '../keyboard/settings-keyboard-bridge.service';

export const GUIDED_TOUR_SEEN_KEY = 'app.guidedTourSeen';

export interface GuidedTourStep {
  view: 'notes' | 'settings';
  section?: SettingsTabId;
  target: string;
  title: string;
  body: string;
}

export interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface PanelPosition {
  left: number;
  top: number;
}

export type GuidedTourKeyAction =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'close' }
  | { type: 'activate' }
  | { type: 'cycle'; delta: 1 | -1 }
  | { type: 'move'; direction: 'left' | 'right' | 'up' | 'down' };

export const GUIDED_TOUR_STEPS: readonly GuidedTourStep[] = [
  {
    view: 'notes',
    target: '#addNoteButton',
    title: 'Create tasks',
    body: 'Use the add button to open a focused task form for the current board.',
  },
  {
    view: 'notes',
    target: '#notesBoard',
    title: 'Work the board',
    body: 'Cards live in Pending and Complete. The app is keyboard-first: move by visual direction, then press Enter on focused controls.',
  },
  {
    view: 'settings',
    section: 'boards',
    target: '#settingsView',
    title: 'Open Settings',
    body: 'Settings are split into sections. The tour will switch through each section so you know where the main controls live.',
  },
  {
    view: 'settings',
    section: 'boards',
    target: '#settingsPanelBoards',
    title: 'Boards',
    body: 'Add, rename, remove, and reorder boards. These are the tabs above your Pending and Complete columns.',
  },
  {
    view: 'settings',
    section: 'appearance',
    target: '#settingsPanelAppearance',
    title: 'Appearance',
    body: 'Change the theme here or from the top bar, and pick the popup size that fits your workflow.',
  },
  {
    view: 'settings',
    section: 'data',
    target: '#settingsPanelData',
    title: 'Data',
    body: 'Import and export your local database or CSV when you want a backup or a portable copy.',
  },
  {
    view: 'settings',
    section: 'ai',
    target: '#settingsPanelAi',
    title: 'AI',
    body: 'Connect Ollama and tune completion vocabulary for the new-task autocomplete flow.',
  },
  {
    view: 'settings',
    section: 'obsidian',
    target: '#settingsPanelObsidian',
    title: 'Obsidian',
    body: 'Link your vault folder and configure sync so cards can compare and update Markdown files.',
  },
  {
    view: 'settings',
    section: 'keyboard',
    target: '#settingsPanelKeyboard',
    title: 'Keyboard',
    body: 'Choose Windows / Linux (Alt+letters) or Mac (Ctrl+letters, not Command), and QWERTY or Dvorak, so the tour and docs match the keys you press.',
  },
];

export function spotlightRadiusFromBorderRadius(borderRadiusPx: number): number {
  if (!Number.isFinite(borderRadiusPx)) return 8;
  return Math.min(Math.max(borderRadiusPx + 8, 8), 18);
}

export function computeSpotlightRect(
  target: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
  padding = 8
): Omit<SpotlightRect, 'radius'> {
  const x = Math.max(8, target.left - padding);
  const y = Math.max(8, target.top - padding);
  const width = Math.min(viewport.width - x - 8, target.width + padding * 2);
  const height = Math.min(viewport.height - y - 8, target.height + padding * 2);
  return {
    x,
    y,
    width: Math.max(width, 24),
    height: Math.max(height, 24),
  };
}

export function computeTourPanelPosition(
  target: { left: number; top: number; width: number; height: number },
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 12,
  gap = 14
): PanelPosition {
  const targetCenter = target.left + target.width / 2;
  const left = Math.min(
    Math.max(margin, targetCenter - panel.width / 2),
    Math.max(margin, viewport.width - panel.width - margin)
  );
  let top = target.top + target.height + gap;

  if (top + panel.height > viewport.height - margin) {
    top = target.top - panel.height - gap;
  }
  if (top < margin) {
    top = Math.max(margin, viewport.height - panel.height - margin);
  }

  return { left, top };
}

function arrowDirection(raw: string, code: string): 'left' | 'right' | 'up' | 'down' | null {
  if (raw === 'ArrowLeft' || code === 'ArrowLeft') return 'left';
  if (raw === 'ArrowRight' || code === 'ArrowRight') return 'right';
  if (raw === 'ArrowUp' || code === 'ArrowUp') return 'up';
  if (raw === 'ArrowDown' || code === 'ArrowDown') return 'down';
  return null;
}

export function guidedTourKeyAction(
  event: KeyboardEvent,
  layout: KeyboardLayout,
  platform: KeyboardNavPlatform
): GuidedTourKeyAction | null {
  const raw = event.key;
  const code = event.code || '';
  const key = (raw || '').toLowerCase();
  const nav = getNavKeys(layout);

  if (raw === 'Escape' && !event.ctrlKey && !event.metaKey) return { type: 'close' };
  if (raw === 'Tab') return { type: 'cycle', delta: event.shiftKey ? -1 : 1 };
  if (raw === 'Enter' || raw === ' ') return { type: 'activate' };

  const arrow = arrowDirection(raw, code);
  if (arrow) return { type: 'move', direction: arrow };

  if (key === nav.right || key === nav.down) {
    if (modKeyOnly(event, platform)) return { type: 'next' };
    if (event.metaKey || event.ctrlKey || event.altKey) return null;
    return { type: 'move', direction: key === nav.right ? 'right' : 'down' };
  }
  if (key === nav.left || key === nav.up) {
    if (modKeyOnly(event, platform)) return { type: 'back' };
    if (event.metaKey || event.ctrlKey || event.altKey) return null;
    return { type: 'move', direction: key === nav.left ? 'left' : 'up' };
  }

  return null;
}

export function cycleTourFocusables(buttons: HTMLButtonElement[], delta: 1 | -1): HTMLButtonElement | null {
  const enabled = buttons.filter((button) => !button.disabled);
  if (!enabled.length) return null;
  const active = document.activeElement;
  const current = enabled.findIndex((button) => button === active || button.contains(active));
  const nextIndex = current < 0 ? (delta > 0 ? 0 : enabled.length - 1) : (current + delta + enabled.length) % enabled.length;
  return enabled[nextIndex] ?? null;
}
