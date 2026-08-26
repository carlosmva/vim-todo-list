export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}
