import { describe, expect, it } from 'vitest';
import { buildObsidianConflictDiff } from './obsidian-conflict-diff.util';
import {
  buildObsidianMarkdownBody,
  compareObsidianNoteToVault,
} from './obsidian-markdown.util';
import { Note } from '../models/note.model';

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

  it('does not mark title or footer as changed when only a properties fence was added', () => {
    const note: Note = {
      id: 7,
      text: 'Title',
      status: 'pending',
      priority: 'normal',
      created_at: 1,
      updated_at: 1,
      completed_at: null,
      notes_html: 'Hello',
      sort_order: 0,
      board: 'Work',
      due_at: null,
    };
    const appBody = buildObsidianMarkdownBody(note);
    const vault = `---\ntags:\n  - inbox\n---\n\n${appBody.replace('Hello', 'Hello world')}`;
    const compared = compareObsidianNoteToVault(note, vault);
    const diff = buildObsidianConflictDiff(compared.appBody, compared.vaultBody);
    expect(diff.appLines.some((line) => line.kind !== 'same' && line.text.includes('# Title'))).toBe(false);
    expect(diff.vaultLines.some((line) => line.kind !== 'same' && line.text.includes('*Board:'))).toBe(false);
    expect(diff.appLines.some((line) => line.kind === 'added' && line.text.includes('Hello'))).toBe(true);
    expect(diff.vaultLines.some((line) => line.kind === 'added' && line.text.includes('Hello world'))).toBe(true);
  });
});
