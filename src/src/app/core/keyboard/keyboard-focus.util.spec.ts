import { describe, expect, it, afterEach } from 'vitest';
import {
  focusCalendarClose,
  focusCalendarSelectedDay,
  moveCalendarFocus,
  resolveVimListJumpContext,
} from './keyboard-focus.util';

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

describe('moveCalendarFocus', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function frame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }

  it('returns false when up is pressed on the first row of the first month so Close can take focus', () => {
    document.body.innerHTML = `
      <button data-calendar-month-step="-1" disabled>prev</button>
      <button class="calendarDayCell" data-calendar-month="0" data-calendar-row="0" data-calendar-column="6" id="today">6</button>
    `;
    const today = document.getElementById('today');
    today?.focus();
    expect(moveCalendarFocus(-1, 0)).toBe(false);
    expect(document.activeElement).toBe(today);
  });

  it('steps to the previous month from the first row and focuses the matching day', async () => {
    document.body.innerHTML = `
      <button type="button" data-calendar-month-step="-1" id="prev">prev</button>
      <button class="calendarDayCell" data-calendar-month="1" data-calendar-row="0" data-calendar-column="3" id="cur">6</button>
    `;
    document.getElementById('prev')?.addEventListener('click', () => {
      document.getElementById('cur')?.replaceWith(
        Object.assign(document.createElement('button'), {
          id: 'prevMonth',
          className: 'calendarDayCell',
        })
      );
      const next = document.getElementById('prevMonth');
      if (next) {
        next.dataset['calendarMonth'] = '0';
        next.dataset['calendarRow'] = '4';
        next.dataset['calendarColumn'] = '3';
      }
    });
    document.getElementById('cur')?.focus();
    expect(moveCalendarFocus(-1, 0)).toBe(true);
    await frame();
    expect(document.activeElement?.id).toBe('prevMonth');
  });

  it('focuses the calendar Close control', () => {
    document.body.innerHTML = `
      <div class="view" aria-label="Calendar">
        <a class="monoLinkButton title-bar__closeLink" id="close" href="/">Close</a>
        <button class="calendarDayCell calendarDayCell--selected" id="day">6</button>
      </div>
    `;
    expect(focusCalendarClose()).toBe(true);
    expect(document.activeElement?.id).toBe('close');
    expect(focusCalendarSelectedDay()).toBe(true);
    expect(document.activeElement?.id).toBe('day');
  });
});
