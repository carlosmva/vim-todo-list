import { describe, expect, it, afterEach } from 'vitest';
import { resolveVimListJumpContext } from './keyboard-focus.util';

describe('resolveVimListJumpContext', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('treats board tabs as the tabs row', () => {
    document.body.innerHTML = `<ul id="boardTabs"><button id="tabA" role="tab">Work</button></ul>`;
    expect(resolveVimListJumpContext(document.getElementById('tabA'))).toBe('tabs');
  });

  it('treats cards and column headers as the cards section', () => {
    document.body.innerHTML = `
      <main id="notesBoard">
        <section id="colPending" class="col" tabindex="0">
          <div id="pendingList" class="list">
            <article class="noteCard" data-note-id="7"><button id="cardBtn">Priority</button></article>
          </div>
        </section>
      </main>
    `;
    expect(resolveVimListJumpContext(document.getElementById('cardBtn'))).toBe('cards');
    expect(resolveVimListJumpContext(document.getElementById('colPending'))).toBe('cards');
  });

  it('ignores the filter input and notes editor', () => {
    document.body.innerHTML = `
      <input id="cardFilterInput" />
      <article class="noteCard" data-note-id="1">
        <div class="noteEditorArea" id="editor" contenteditable="true"></div>
      </article>
    `;
    expect(resolveVimListJumpContext(document.getElementById('cardFilterInput'))).toBeNull();
    expect(resolveVimListJumpContext(document.getElementById('editor'))).toBeNull();
  });
});
