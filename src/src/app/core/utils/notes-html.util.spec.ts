import { describe, expect, it } from 'vitest';
import { notesContentToPreviewMarkdown } from './notes-html.util';

describe('notesContentToPreviewMarkdown', () => {
  it('passes markdown through for ngx-markdown preview', () => {
    expect(notesContentToPreviewMarkdown('A **bold** line\n\n- item')).toBe(
      'A **bold** line\n\n- item'
    );
  });

  it('converts previously imported HTML back to markdown instead of plain text', () => {
    const preview = notesContentToPreviewMarkdown(
      '<p>A <strong>bold</strong> line</p><ul><li>item</li></ul>'
    );
    expect(preview).toContain('**bold**');
    expect(preview).toMatch(/-\s*item/);
    expect(preview).not.toMatch(/<\/?p>/i);
  });
});
