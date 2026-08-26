export const ENVELOPE_KEY = 'vtd_v2';

/** Compact JSON envelope stored in chrome.storage.local */
export interface StorageEnvelope {
  v: 2;
  db?: string;
  t?: string;
  b?: string;
  kl?: 'qwerty' | 'dvorak';
  knp?: 'mac' | 'winlinux';
  bg?: string;
  ai?: { u?: string; m?: string; w?: string };
  obs?: { v?: string; f?: string; s?: boolean };
  ps?: 's' | 'm' | 'm1' | 'm2' | 'l' | 'full';
}

export const LEGACY_KEYS = {
  db: 'sqliteDb_v1',
  theme: 'theme_v1',
  board: 'activeBoard_v1',
  keyLayout: 'keyLayout_v1',
  keyboardNav: 'keyboardNavPlatform_v1',
  customBg: 'customBackground_v1',
  aiUrl: 'aiEndpointBaseUrl_v1',
  aiWords: 'aiCustomWords_v1',
} as const;

export const DEFAULT_BOARD = 'To Do';
export const DEFAULT_THEME = 'dark';

export const THEME_ORDER = [
  'light',
  'dark',
  'solarized-light',
  'solarized-dark',
  'emacs',
  'emacs-dark',
  'command-line',
  'nothing',
  'nothing-light',
] as const;

export type ThemeId = (typeof THEME_ORDER)[number];
