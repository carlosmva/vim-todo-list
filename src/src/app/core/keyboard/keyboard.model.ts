export type KeyboardLayout = 'qwerty' | 'dvorak';
export type KeyboardNavPlatform = 'mac' | 'winlinux';

export interface NavKeys {
  up: string;
  down: string;
  left: string;
  right: string;
}

const isMacPlatform =
  typeof navigator !== 'undefined' &&
  (/Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform === 'macOS');

export function defaultKeyboardNavPlatform(): KeyboardNavPlatform {
  return isMacPlatform ? 'mac' : 'winlinux';
}

export function getNavKeys(layout: KeyboardLayout): NavKeys {
  if (layout === 'dvorak') {
    return { down: 't', up: 'c', left: 'h', right: 'n' };
  }
  return { down: 'k', up: 'i', left: 'j', right: 'l' };
}

export function getNotesCheckboxKey(layout: KeyboardLayout): string {
  return layout === 'dvorak' ? 'd' : 'h';
}

export function getFocusNewNoteKey(layout: KeyboardLayout): string {
  return layout === 'dvorak' ? 'l' : 'p';
}

export function getPendingColumnKey(_layout: KeyboardLayout): string {
  return 'p';
}

export function getCompleteColumnKey(_layout: KeyboardLayout): string {
  return 'c';
}

export function modKeyLabel(platform: KeyboardNavPlatform): string {
  return platform === 'mac' ? 'Ctrl' : 'Alt';
}

export function useNavMacModifier(platform: KeyboardNavPlatform): boolean {
  return platform === 'mac';
}

export function modKeyActive(
  e: KeyboardEvent,
  platform: KeyboardNavPlatform
): boolean {
  return useNavMacModifier(platform) ? !!e.ctrlKey : !!e.altKey;
}

export function modKeyOnly(e: KeyboardEvent, platform: KeyboardNavPlatform): boolean {
  if (!modKeyActive(e, platform)) return false;
  return useNavMacModifier(platform) ? !e.metaKey && !e.altKey : !e.ctrlKey && !e.metaKey;
}
