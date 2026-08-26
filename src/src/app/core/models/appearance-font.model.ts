export const DEFAULT_HEADER_TITLE = 'Vim To-Do List';

/** Top-tier defaults when nothing is stored (replaces theme Montserrat/IBM Plex). */
export const DEFAULT_INTERFACE_FONT = 'plus-jakarta' as const;
export const DEFAULT_HEADER_TITLE_FONT = 'plus-jakarta' as const;

export const INTERFACE_FONT_ORDER = [
  'plus-jakarta',
  'inter',
  'manrope',
  'dm-sans',
  'sora',
  'montserrat',
  'red-hat',
] as const;

export type InterfaceFontKey = (typeof INTERFACE_FONT_ORDER)[number];

export const INTERFACE_FONT_LABELS: Record<InterfaceFontKey, string> = {
  inter: 'Inter',
  manrope: 'Manrope',
  'dm-sans': 'DM Sans',
  'plus-jakarta': 'Plus Jakarta Sans',
  sora: 'Sora',
  montserrat: 'Montserrat',
  'red-hat': 'Red Hat Text',
};

export const INTERFACE_FONT_FAMILIES: Record<InterfaceFontKey, string> = {
  inter: '"Inter", system-ui, sans-serif',
  manrope: '"Manrope", system-ui, sans-serif',
  'dm-sans': '"DM Sans", system-ui, sans-serif',
  'plus-jakarta': '"Plus Jakarta Sans", system-ui, sans-serif',
  sora: '"Sora", system-ui, sans-serif',
  montserrat: '"Montserrat", system-ui, sans-serif',
  'red-hat': '"Red Hat Text", system-ui, sans-serif',
};

/** Value "" means follow each theme's header title styling. */
export const HEADER_TITLE_FONT_ORDER = [
  '',
  'plus-jakarta',
  'kelvinized',
  'inter',
  'manrope',
  'dm-sans',
  'sora',
  'montserrat',
  'red-hat',
  'space-grotesk',
  'doto',
  'space-mono',
] as const;

export type HeaderTitleFontKey = (typeof HEADER_TITLE_FONT_ORDER)[number];

export const HEADER_TITLE_FONT_LABELS: Record<HeaderTitleFontKey, string> = {
  '': 'Theme default',
  kelvinized: 'Kelvinized',
  inter: 'Inter',
  manrope: 'Manrope',
  'dm-sans': 'DM Sans',
  'plus-jakarta': 'Plus Jakarta Sans',
  sora: 'Sora',
  montserrat: 'Montserrat',
  'red-hat': 'Red Hat Display',
  'space-grotesk': 'Space Grotesk',
  doto: 'Doto',
  'space-mono': 'Space Mono',
};

export const HEADER_TITLE_FONT_FAMILIES: Record<Exclude<HeaderTitleFontKey, ''>, string> = {
  kelvinized: '"Kelvinized Normal", system-ui, sans-serif',
  inter: '"Inter", system-ui, sans-serif',
  manrope: '"Manrope", system-ui, sans-serif',
  'dm-sans': '"DM Sans", system-ui, sans-serif',
  'plus-jakarta': '"Plus Jakarta Sans", system-ui, sans-serif',
  sora: '"Sora", system-ui, sans-serif',
  montserrat: '"Montserrat", system-ui, sans-serif',
  'red-hat': '"Red Hat Display", system-ui, sans-serif',
  'space-grotesk': '"Space Grotesk", system-ui, sans-serif',
  doto: '"Doto", "Space Grotesk", system-ui, sans-serif',
  'space-mono': '"Space Mono", ui-monospace, monospace',
};

export function normalizeHeaderTitleInput(value: string): string {
  return String(value || '')
    .replace(/[\r\n\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 80);
}

export function headerTitleForDisplay(storedRaw: string): string {
  const trimmed = normalizeHeaderTitleInput(storedRaw);
  return trimmed || DEFAULT_HEADER_TITLE;
}

export function normalizeInterfaceFontKey(stored: string): InterfaceFontKey | '' {
  const key = String(stored || '').trim();
  if (!key) return '';
  return (INTERFACE_FONT_ORDER as readonly string[]).includes(key) ? (key as InterfaceFontKey) : '';
}

export function normalizeHeaderTitleFontKey(stored: string): HeaderTitleFontKey {
  const key = String(stored || '').trim();
  if (!key) return '';
  return (HEADER_TITLE_FONT_ORDER as readonly string[]).includes(key) ? (key as HeaderTitleFontKey) : '';
}

export function resolveInterfaceFont(stored: string | null | undefined): InterfaceFontKey {
  const normalized = normalizeInterfaceFontKey(stored ?? '');
  return normalized || DEFAULT_INTERFACE_FONT;
}

export function resolveHeaderTitleFont(stored: string | null | undefined): HeaderTitleFontKey {
  if (stored === null || stored === undefined || stored === '') {
    return DEFAULT_HEADER_TITLE_FONT;
  }
  const normalized = normalizeHeaderTitleFontKey(stored);
  return normalized || DEFAULT_HEADER_TITLE_FONT;
}

export function interfaceFontLabel(key: InterfaceFontKey): string {
  return INTERFACE_FONT_LABELS[key] || key;
}

export function headerTitleFontLabel(key: HeaderTitleFontKey): string {
  return HEADER_TITLE_FONT_LABELS[key] || key || 'Theme default';
}
