import { describe, expect, it } from 'vitest';
import { buildObsidianConflictDiff } from './obsidian-conflict-diff.util';

describe('buildObsidianConflictDiff', () => {
  it('marks added and removed lines', () => {
    const diff = buildObsidianConflictDiff('# Card\nhello\n', '# Card\nworld\n');
    expect(diff.appLines.some((line) => line.kind === 'added' && line.text.includes('hello'))).toBe(true);
    expect(diff.vaultLines.some((line) => line.kind === 'added' && line.text.includes('world'))).toBe(true);
  });

  it('falls back to a plain preview when the note is too large', () => {
    const huge = Array.from({ length: 700 }, (_, i) => `line ${i}`).join('\n');
    const diff = buildObsidianConflictDiff(huge, `${huge}\nextra`);
    expect(diff.appLines[0]).toMatchObject({
      kind: 'note',
      text: 'Diff is large; showing plain preview.',
    });
    expect(diff.vaultLines[0].kind).toBe('note');
    expect(diff.appLines.length).toBeGreaterThan(2);
  });
});
