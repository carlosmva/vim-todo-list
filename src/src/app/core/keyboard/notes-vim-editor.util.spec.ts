import { afterEach, describe, expect, it } from 'vitest';
import { lineRangeFromCaret } from './notes-vim-editor.util';

function editorWith(html: string): HTMLElement {
  const editor = document.createElement('div');
  editor.className = 'noteEditorArea';
  editor.innerHTML = html;
  document.body.appendChild(editor);
  return editor;
}

function caretInText(editor: HTMLElement, needle: string): Range {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    const idx = (text.nodeValue || '').indexOf(needle);
    if (idx < 0) continue;
    const r = document.createRange();
    r.setStart(text, idx);
    r.collapse(true);
    return r;
  }
  throw new Error(`text not found: ${needle}`);
}

function deleteLineAt(editor: HTMLElement, needle: string): string {
  const line = lineRangeFromCaret(editor, caretInText(editor, needle));
  expect(line).toBeTruthy();
  line!.deleteContents();
  return editor.innerHTML;
}

describe('lineRangeFromCaret / dd', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('deletes only the current br-separated row, not the whole note', () => {
    const editor = editorWith('alpha<br>beta<br>gamma');
    expect(deleteLineAt(editor, 'beta')).toBe('alpha<br>gamma');
  });

  it('deletes the first br-separated row including its trailing break', () => {
    const editor = editorWith('alpha<br>beta<br>gamma');
    expect(deleteLineAt(editor, 'alpha')).toBe('beta<br>gamma');
  });

  it('deletes the last br-separated row without leaving a dangling break', () => {
    const editor = editorWith('alpha<br>beta<br>gamma');
    expect(deleteLineAt(editor, 'gamma')).toBe('alpha<br>beta');
  });

  it('deletes one div row among sibling divs', () => {
    const editor = editorWith('<div>alpha</div><div>beta</div><div>gamma</div>');
    expect(deleteLineAt(editor, 'beta')).toBe('<div>alpha</div><div>gamma</div>');
  });

  it('deletes one row inside a wrapper that uses brs for markdown lines', () => {
    const editor = editorWith('<div>alpha<br>beta<br>gamma</div>');
    expect(deleteLineAt(editor, 'beta')).toBe('<div>alpha<br>gamma</div>');
  });
});
