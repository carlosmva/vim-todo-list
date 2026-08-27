import { describe, expect, it } from 'vitest';
import { parseObsidianMarkdownImport } from './obsidian-markdown.util';

describe('parseObsidianMarkdownImport', () => {
  it('keeps vault body markdown instead of converting it to HTML', () => {
    const md = [
      '# Card title',
      '',
      '**Due:** Jan 1, 2026',
      '',
      'A **bold** line',
      '',
      '- one',
      '- two',
      '',
      '## Heading',
      '',
      '---',
      '*Board: Work · Vim To-Do (id 7)*',
      '#vim-todo/pending',
    ].join('\n');

    const imported = parseObsidianMarkdownImport(md);

    expect(imported.title).toBe('Card title');
    expect(imported.notes_html).toContain('A **bold** line');
    expect(imported.notes_html).toContain('- one');
    expect(imported.notes_html).toContain('## Heading');
    expect(imported.notes_html).not.toMatch(/<\/?(p|strong|ul|li|h2)>/i);
    expect(imported.notes_html).not.toContain('*Board:');
  });
});
