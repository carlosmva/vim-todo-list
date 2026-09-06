import { describe, expect, it } from 'vitest';
import { Note } from '../models/note.model';
import {
  buildObsidianMarkdown,
  buildObsidianMarkdownBody,
  compareObsidianNoteToVault,
  formatDueDateForObsidian,
  parseDueDateFromObsidian,
  parseObsidianMarkdownImport,
  splitObsidianFrontmatter,
} from './obsidian-markdown.util';

function card(overrides: Partial<Note> = {}): Note {
  return {
    id: 7,
    text: 'Title',
    status: 'pending',
    priority: 'normal',
    created_at: 1,
    updated_at: 1,
    completed_at: null,
    notes_html: '',
    sort_order: 0,
    board: 'Work',
    due_at: null,
    ...overrides,
  };
}

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
    expect(imported.board).toBe('Work');
    expect(imported.status).toBe('pending');
    expect(imported.id).toBe(7);
    expect(imported.due_at).toBe(Date.UTC(2026, 0, 1));
  });

  it('restores complete status and due from exported markdown', () => {
    const due = Date.UTC(2026, 2, 15);
    const md = [
      '# Done card',
      '',
      `**Due:** ${formatDueDateForObsidian(due)}`,
      '',
      'Body',
      '',
      '---',
      '*Board: Archive · Vim To-Do (id 42)*',
      '#vim-todo/complete',
    ].join('\n');

    const imported = parseObsidianMarkdownImport(md);
    expect(imported.board).toBe('Archive');
    expect(imported.status).toBe('complete');
    expect(imported.id).toBe(42);
    expect(imported.due_at).toBe(due);
    expect(parseDueDateFromObsidian(formatDueDateForObsidian(due))).toBe(due);
  });

  it('leaves board, id, and due empty when the footer is missing', () => {
    const imported = parseObsidianMarkdownImport('# Native note\n\nJust a daily note.');
    expect(imported.title).toBe('Native note');
    expect(imported.notes_html).toContain('Just a daily note.');
    expect(imported.board).toBe('');
    expect(imported.status).toBe('pending');
    expect(imported.id).toBeNull();
    expect(imported.due_at).toBeNull();
    expect(imported.priority).toBeNull();
  });

  it('strips a properties fence and lets known keys win over body and footer', () => {
    const md = [
      '---',
      'due: 2026-01-15',
      'status: complete',
      'board: Archive',
      'priority: high',
      'vim-todo-id: 42',
      'tags:',
      '  - project',
      '---',
      '',
      '# Card title',
      '',
      '**Due:** Jan 1, 2026',
      '',
      'Body text',
      '',
      '---',
      '*Board: Work · Vim To-Do (id 7)*',
      '#vim-todo/pending',
    ].join('\n');

    const imported = parseObsidianMarkdownImport(md);
    expect(imported.title).toBe('Card title');
    expect(imported.notes_html).toBe('Body text');
    expect(imported.notes_html).not.toContain('---');
    expect(imported.notes_html).not.toContain('tags:');
    expect(imported.due_at).toBe(Date.UTC(2026, 0, 15));
    expect(imported.status).toBe('complete');
    expect(imported.board).toBe('Archive');
    expect(imported.priority).toBe('high');
    expect(imported.id).toBe(42);
  });
});

describe('Obsidian properties fence', () => {
  it('splits a closed fence and leaves an unclosed leading rule as body', () => {
    const closed = splitObsidianFrontmatter('---\ntags:\n  - x\n---\n\n# Title\n');
    expect(closed.hasFence).toBe(true);
    expect(closed.yaml).toContain('tags:');
    expect(closed.body.startsWith('# Title')).toBe(true);

    const unclosed = splitObsidianFrontmatter('---\n# Title\n\nJust a rule.\n');
    expect(unclosed.hasFence).toBe(false);
    expect(unclosed.body).toContain('# Title');
  });

  it('does not treat the footer separator as a properties closer', () => {
    const md = '# Title\n\n---\n*Board: Work · Vim To-Do (id 7)*\n#vim-todo/pending';
    const split = splitObsidianFrontmatter(md);
    expect(split.hasFence).toBe(false);
    expect(split.body).toContain('*Board:');
  });

  it('preserves unknown keys when rewriting a card over an existing file', () => {
    const existing = [
      '---',
      'tags:',
      '  - project',
      'aliases:',
      '  - Old name',
      'cssclasses: [wide]',
      '---',
      '',
      '# Other',
    ].join('\n');
    const written = buildObsidianMarkdown(card({ due_at: Date.UTC(2026, 0, 15) }), existing);
    expect(written.startsWith('---\n')).toBe(true);
    expect(written).toContain('due: 2026-01-15');
    expect(written).toContain('status: pending');
    expect(written).toContain('board: Work');
    expect(written).toContain('priority: normal');
    expect(written).toContain('vim-todo-id: 7');
    expect(written).toContain('tags:');
    expect(written).toContain('project');
    expect(written).toContain('aliases:');
    expect(written).toContain('Old name');
    expect(written).toContain('cssclasses:');
    expect(written).toContain('# Title');
  });

  it('treats a vault-only matching properties block as equal', () => {
    const note = card({ notes_html: 'Hello' });
    const body = buildObsidianMarkdownBody(note);
    const vault = `---\ntags:\n  - extra\n---\n\n${body}`;
    const compared = compareObsidianNoteToVault(note, vault);
    expect(compared.equal).toBe(true);
    expect(compared.propertyDiffs).toEqual([]);
    expect(compared.appBody).toBe(compared.vaultBody);
  });

  it('flags a known property mismatch even when the body matches', () => {
    const note = card({ due_at: Date.UTC(2026, 0, 1) });
    const body = buildObsidianMarkdownBody(note);
    const vault = `---\ndue: 2026-02-01\n---\n\n${body}`;
    const compared = compareObsidianNoteToVault(note, vault);
    expect(compared.equal).toBe(false);
    expect(compared.propertyDiffs).toEqual([
      { key: 'due', appValue: '2026-01-01', vaultValue: '2026-02-01' },
    ]);
  });
});
