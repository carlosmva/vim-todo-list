export const POPUP_SIZE_ORDER = ['m', 'l', 'full'] as const;
export type PopupSizeId = (typeof POPUP_SIZE_ORDER)[number];
type PopupSizeDefinitionId = PopupSizeId | 's';

export const POPUP_SIZE_LABELS: Record<PopupSizeDefinitionId, string> = {
  s: 'Small',
  m: 'Medium',
  l: 'Large',
  full: 'Full screen',
};

/** Iframe + document dimensions — wider gaps between steps (S → M → L). */
export const POPUP_SIZE_DIMENSIONS: Record<
  PopupSizeDefinitionId,
  { width: string; height: string; label: string }
> = {
  s: { width: '560px', height: '420px', label: 'Small (560×420)' },
  m: { width: '800px', height: '600px', label: 'Medium (800×600)' },
  l: { width: '1200px', height: '860px', label: 'Large (1200×860)' },
  full: { width: '100%', height: '100%', label: 'Full screen' },
};
