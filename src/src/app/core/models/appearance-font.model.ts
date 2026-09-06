export const DEFAULT_HEADER_TITLE = 'Vim To-Do List';

/** Theme chrome uses the platform UI face until the user picks a family. */
export const DEFAULT_INTERFACE_FONT = 'system-ui';
export const DEFAULT_HEADER_TITLE_FONT = '';

/** Installed-family names. Kept as a fallback when local font enumeration is blocked. */
export const INTERFACE_FONT_ORDER = [
  'system-ui',
  'Segoe UI',
  'Calibri',
  'Cambria',
  'Candara',
  'Consolas',
  'Constantia',
  'Corbel',
  'Georgia',
  'Tahoma',
  'Trebuchet MS',
  'Verdana',
  'Arial',
  'Arial Black',
  'Comic Sans MS',
  'Impact',
  'Times New Roman',
  'Courier New',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Palatino Linotype',
  'Franklin Gothic Medium',
  'Bahnschrift',
  'Cascadia Code',
  'Cascadia Mono',
  'Aptos',
  'Sitka Text',
  'Ink Free',
  'Helvetica',
  'Helvetica Neue',
  'San Francisco',
  'Avenir',
  'Futura',
  'Gill Sans',
  'Optima',
  'Palatino',
  'Baskerville',
  'Menlo',
  'Monaco',
  'Geneva',
  'Lucida Grande',
  'sans-serif',
  'serif',
  'monospace',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
] as const;

export type InterfaceFontKey = string;

const LEGACY_INTERFACE_FONT_FAMILIES: Record<string, string> = {
  inter: 'Inter',
  manrope: 'Manrope',
  'dm-sans': 'DM Sans',
  'plus-jakarta': 'Plus Jakarta Sans',
  sora: 'Sora',
  montserrat: 'Montserrat',
  'red-hat': 'Red Hat Text',
};

const GENERIC_FONT_FAMILIES = new Set([
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

/** Value "" means follow each theme's header title styling. */
export const HEADER_TITLE_FONT_ORDER = ['', ...INTERFACE_FONT_ORDER] as const;

export type HeaderTitleFontKey = string;

export const HEADER_TITLE_FONT_LABELS: Record<string, string> = {
  '': 'Theme default',
};

const LEGACY_HEADER_TITLE_FONT_FAMILIES: Record<string, string> = {
  kelvinized: 'Kelvinized Normal',
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

export function sanitizeFontFamilyName(raw: string): string {
  return String(raw || '')
    .replace(/["';{}\\<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function normalizeInterfaceFontKey(stored: string): InterfaceFontKey | '' {
  const key = sanitizeFontFamilyName(stored);
  if (!key) return '';
  return LEGACY_INTERFACE_FONT_FAMILIES[key] || key;
}

export function interfaceFontCss(family: string): string {
  const name = normalizeInterfaceFontKey(family) || DEFAULT_INTERFACE_FONT;
  if (GENERIC_FONT_FAMILIES.has(name)) return `${name}, sans-serif`;
  return `"${name}", system-ui, sans-serif`;
}

export function headerTitleFontCss(family: string): string {
  return interfaceFontCss(family);
}

export function normalizeHeaderTitleFontKey(stored: string): HeaderTitleFontKey {
  const key = sanitizeFontFamilyName(stored);
  if (!key) return '';
  return LEGACY_HEADER_TITLE_FONT_FAMILIES[key] || key;
}

export function resolveInterfaceFont(stored: string | null | undefined): InterfaceFontKey {
  const normalized = normalizeInterfaceFontKey(stored ?? '');
  return normalized || DEFAULT_INTERFACE_FONT;
}

export function resolveHeaderTitleFont(stored: string | null | undefined): HeaderTitleFontKey {
  if (stored === null || stored === undefined) return DEFAULT_HEADER_TITLE_FONT;
  return normalizeHeaderTitleFontKey(stored);
}

export function interfaceFontLabel(key: InterfaceFontKey): string {
  return normalizeInterfaceFontKey(key) || key || DEFAULT_INTERFACE_FONT;
}

export function headerTitleFontLabel(key: HeaderTitleFontKey): string {
  const normalized = normalizeHeaderTitleFontKey(key);
  return HEADER_TITLE_FONT_LABELS[normalized] || normalized || 'Theme default';
}
