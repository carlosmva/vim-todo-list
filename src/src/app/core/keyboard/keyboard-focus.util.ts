import { focusSettingsTabEntry } from './settings-keyboard.util';

export function isVerticallyScrollable(node: HTMLElement): boolean {
  const style = getComputedStyle(node);
  const overflowY = style.overflowY;
  if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') return false;
  return node.scrollHeight > node.clientHeight + 1;
}

/** Scroll overflow ancestors so `el` is fully visible. Ignores overflow:hidden shells. */
export function ensureElementFullyVisible(el: HTMLElement, margin = 12): void {
  const containers: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  let parent = el.parentElement;
  while (parent) {
    if (!seen.has(parent) && isVerticallyScrollable(parent)) {
      seen.add(parent);
      containers.push(parent);
    }
    parent = parent.parentElement;
  }

  if (!containers.length) {
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch {
      /* ignore */
    }
    return;
  }

  for (const container of containers) {
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const visibleHeight = Math.max(0, containerRect.height - margin * 2);

    if (elRect.height > visibleHeight) {
      const topDelta = elRect.top - (containerRect.top + margin);
      if (topDelta < 0 || topDelta > margin) container.scrollTop += topDelta;
      continue;
    }

    const topOverflow = containerRect.top + margin - elRect.top;
    const bottomOverflow = elRect.bottom - (containerRect.bottom - margin);
    if (topOverflow > 0) container.scrollTop -= topOverflow;
    else if (bottomOverflow > 0) container.scrollTop += bottomOverflow;
  }
}

export function safeFocus(
  node: HTMLElement | null | undefined,
  options?: { scroll?: boolean }
): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.hasAttribute('disabled') || node.getAttribute('aria-hidden') === 'true') return false;

  const attempt = (): boolean => {
    try {
      node.focus({ preventScroll: true });
      if (document.activeElement !== node) return false;
      if (options?.scroll) ensureElementFullyVisible(node);
      return true;
    } catch {
      return false;
    }
  };

  const active = document.activeElement;
  if (active instanceof HTMLSelectElement && active !== node) {
    active.blur();
  }

  if (attempt()) return true;
  requestAnimationFrame(() => attempt());
  return true;
}

export function isEditableElement(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return true;
  }
  return el.isContentEditable;
}

export function isTypingTarget(el: Element | null): boolean {
  return isEditableElement(el);
}

export function isVisible(el: HTMLElement): boolean {
  if (!el.offsetParent && el.tagName !== 'BODY' && getComputedStyle(el).position !== 'fixed') {
    if (el.closest('[hidden]')) return false;
  }
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

export function getCardFromElement(el: Element | null): HTMLElement | null {
  if (!(el instanceof Element)) return null;
  const card = el.closest('.noteCard[data-note-id]');
  return card instanceof HTMLElement ? card : null;
}

export function getAllCardsInDomOrder(): HTMLElement[] {
  const pending = document.getElementById('pendingList');
  const complete = document.getElementById('completeList');
  const pendingCards = pending
    ? [...pending.querySelectorAll<HTMLElement>('.noteCard[data-note-id]')]
    : [];
  const completeCards = complete
    ? [...complete.querySelectorAll<HTMLElement>('.noteCard[data-note-id]')]
    : [];
  return [...pendingCards, ...completeCards];
}

export function getCardActionButtons(card: HTMLElement): HTMLButtonElement[] {
  const footer = card.querySelector('.noteActions');
  if (!(footer instanceof HTMLElement)) return [];
  return [...footer.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.disabled);
}

export function focusCardPrimaryAction(card: HTMLElement): void {
  const buttons = getCardActionButtons(card);
  if (buttons[0]) safeFocus(buttons[0]);
  ensureCardFullyVisible(card);
}

export function ensureCardFullyVisible(card: HTMLElement): void {
  const margin = 12;
  const containers: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  const pushContainer = (node: Element | null): void => {
    if (!(node instanceof HTMLElement)) return;
    if (seen.has(node)) return;
    if (node.scrollHeight <= node.clientHeight) return;
    seen.add(node);
    containers.push(node);
  };

  pushContainer(card.closest('.col'));
  pushContainer(card.closest('.list'));

  let parent = card.parentElement;
  while (parent) {
    pushContainer(parent);
    parent = parent.parentElement;
  }

  if (!containers.length) {
    card.scrollIntoView({ block: 'nearest' });
    return;
  }

  for (const container of containers) {
    const containerRect = container.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    const visibleHeight = Math.max(0, containerRect.height - margin * 2);
    if (cardRect.height > visibleHeight) {
      const topDelta = cardRect.top - (containerRect.top + margin);
      if (topDelta < 0 || topDelta > margin) container.scrollTop += topDelta;
      continue;
    }

    const topOverflow = containerRect.top + margin - cardRect.top;
    const bottomOverflow = cardRect.bottom - (containerRect.bottom - margin);

    if (topOverflow > 0) container.scrollTop -= topOverflow;
    else if (bottomOverflow > 0) container.scrollTop += bottomOverflow;
  }
}

/** @deprecated Use ensureCardFullyVisible */
export function ensureCardVisible(card: HTMLElement): void {
  ensureCardFullyVisible(card);
}

export function moveCardFocus(
  delta: number,
  options?: {
    onLeaveCard?: (card: HTMLElement) => void;
    loadMoreAfter?: (currentCard: HTMLElement) => boolean;
    loadMoreBefore?: (currentCard: HTMLElement) => boolean;
  }
): void {
  const cards = getAllCardsInDomOrder();
  if (!cards.length) return;
  const active = document.activeElement;
  const current = getCardFromElement(active);
  const idx = current ? cards.indexOf(current) : delta > 0 ? -1 : cards.length;
  let nextIdx = Math.min(cards.length - 1, Math.max(0, idx + delta));

  if (delta > 0 && current && nextIdx === idx && options?.loadMoreAfter?.(current)) {
    return;
  }

  if (delta < 0 && current && nextIdx === idx && options?.loadMoreBefore?.(current)) {
    return;
  }

  const next = cards[nextIdx];
  if (current && next && current !== next) options?.onLeaveCard?.(current);
  focusCardPrimaryAction(next);
}

export function moveButtonFocusWithinCard(card: HTMLElement, delta: number): void {
  const buttons = getCardActionButtons(card);
  if (!buttons.length) return;
  const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
  let next = idx;
  if (next < 0) next = delta < 0 ? buttons.length - 1 : 0;
  else next = Math.min(buttons.length - 1, Math.max(0, next + delta));
  safeFocus(buttons[next]);
  ensureCardFullyVisible(card);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getGlobalNavTargets(root: ParentNode = document): HTMLElement[] {
  const app = root instanceof Document ? root.querySelector('.app') : root;
  if (!(app instanceof HTMLElement)) return [];
  return [...app.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => isVisible(el) && !el.closest('[hidden]') && !el.closest('.addNoteModal[hidden]')
  );
}

export function moveGlobalFocus(delta: number): boolean {
  const targets = getGlobalNavTargets();
  if (!targets.length) return false;
  const active = document.activeElement as HTMLElement | null;
  let idx = active ? targets.indexOf(active) : -1;
  if (idx < 0) idx = delta < 0 ? targets.length : 0;
  else idx = Math.min(targets.length - 1, Math.max(0, idx + delta));
  return safeFocus(targets[idx], { scroll: true });
}

export function getBoardTabElements(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#boardTabs [role="tab"]')].filter(isVisible);
}

export function isOnBoardTabs(el: Element | null): boolean {
  if (!(el instanceof Element)) return false;
  if (el.closest('#boardTabs')) return true;
  return el.getAttribute('role') === 'tab' && !!el.closest('.tabs, .bx--tabs');
}

export type VimListJumpContext = 'tabs' | 'cards';

/** Board tabs row vs kanban cards/columns. Ignores typing fields and the notes editor. */
export function resolveVimListJumpContext(el: Element | null): VimListJumpContext | null {
  if (!(el instanceof Element)) return null;
  if (isTypingTarget(el) || el.closest('.noteEditorArea')) return null;
  if (isOnBoardTabs(el)) return 'tabs';
  if (getCardFromElement(el) || isOnBoardColumn(el) || el.closest('#pendingList, #completeList, #notesBoard')) {
    return 'cards';
  }
  return null;
}

export function resolveBoardTabElement(el: Element | null): HTMLElement | null {
  if (!(el instanceof Element)) return null;
  const direct = el.closest<HTMLElement>('#boardTabs [role="tab"]');
  if (direct) return direct;
  if (isOnBoardTabs(el)) {
    return (
      document.querySelector<HTMLElement>('#boardTabs [role="tab"][aria-selected="true"]') ??
      document.querySelector<HTMLElement>('#boardTabs [role="tab"]')
    );
  }
  return null;
}

export function focusMainBoardSwitcherTab(): boolean {
  const activeTab = document.querySelector<HTMLElement>('#boardTabs [role="tab"][aria-selected="true"]');
  const firstTab = document.querySelector<HTMLElement>('#boardTabs [role="tab"]');
  const target = activeTab ?? firstTab;
  if (target && safeFocus(target)) return true;
  const addBtn = document.getElementById('addNoteButton');
  return addBtn instanceof HTMLElement ? safeFocus(addBtn) : false;
}

export function focusNotesSearchRow(): boolean {
  const filter = document.getElementById('cardFilterInput');
  if (filter instanceof HTMLElement && safeFocus(filter)) return true;
  const addBtn = document.getElementById('addNoteButton');
  return addBtn instanceof HTMLElement ? safeFocus(addBtn) : false;
}

export function getBoardColumnElements(): {
  board: HTMLElement | null;
  pending: HTMLElement | null;
  complete: HTMLElement | null;
} {
  const board = document.getElementById('notesBoard');
  const pending = document.getElementById('colPending');
  const complete = document.getElementById('colComplete');
  return {
    board: board instanceof HTMLElement ? board : null,
    pending: pending instanceof HTMLElement ? pending : null,
    complete: complete instanceof HTMLElement ? complete : null,
  };
}

export function getExpandedBoardColumn(): HTMLElement | null {
  const { board, pending, complete } = getBoardColumnElements();
  if (!board || !pending || !complete) return null;
  return board.classList.contains('board--split-complete') ? complete : pending;
}

export function isOnBoardColumn(el: Element | null): boolean {
  if (!(el instanceof Element)) return false;
  const { pending, complete } = getBoardColumnElements();
  return el === pending || el === complete;
}

export function isBlockingOverlayOpen(): boolean {
  return !!(
    document.getElementById('obsidianConflictModal') ||
    document.getElementById('guidedTour') ||
    document.getElementById('focusMode')
  );
}

export function getHeaderNavTargets(): HTMLElement[] {
  return [
    document.getElementById('themeSelect'),
    document.getElementById('instructionsLink'),
    document.getElementById('aboutLink'),
    document.getElementById('tourBtn'),
    document.getElementById('settingsBtn'),
    document.getElementById('closePopupBtn'),
  ].filter((t): t is HTMLElement => t instanceof HTMLElement && isVisible(t));
}

/** Map focus (including icon children) to a header control. */
export function resolveHeaderNavElement(el: Element | null): HTMLElement | null {
  if (!(el instanceof Element) || !el.closest('.headerLinks')) return null;
  const targets = getHeaderNavTargets();
  if (el instanceof HTMLElement && targets.includes(el)) return el;
  for (const target of targets) {
    if (target.contains(el)) return target;
  }
  return null;
}

export function isViewNavVisible(): boolean {
  const nav = document.querySelector('.viewNav');
  return nav instanceof HTMLElement && isVisible(nav);
}

export function getViewNavTargets(): HTMLElement[] {
  const nav = document.querySelector('.viewNav');
  if (!(nav instanceof HTMLElement) || !isVisible(nav)) return [];
  return [...nav.querySelectorAll<HTMLElement>('.viewNav__link')].filter(isVisible);
}

export function getActiveViewNavLink(): HTMLElement | null {
  const links = getViewNavTargets();
  return links.find((l) => l.classList.contains('viewNav__link--active')) ?? links[0] ?? null;
}

/** Enter the main content area below the view nav (or directly from header when nav hidden). */
export function focusViewContentEntry(path: string, fromHeaderEl: Element | null = null): boolean {
  const route = (path.split('?')[0] || '/').replace(/\/$/, '') || '/';

  if (route === '/') {
    const filter = document.getElementById('cardFilterInput');
    const addBtn = document.getElementById('addNoteButton');
    const fromHeaderSettings =
      fromHeaderEl instanceof HTMLElement &&
      (fromHeaderEl.id === 'settingsBtn' || fromHeaderEl.id === 'closePopupBtn');
    if (fromHeaderSettings && addBtn instanceof HTMLElement) return safeFocus(addBtn);
    if (filter instanceof HTMLElement) return safeFocus(filter);
    if (addBtn instanceof HTMLElement) return safeFocus(addBtn);
    return false;
  }

  if (route === '/dashboard') {
    const filterBtn = document.querySelector<HTMLElement>('.dashboardFilterButton');
    if (filterBtn) return safeFocus(filterBtn);
    const close = document.querySelector<HTMLElement>('[aria-label="Dashboard"] .instructionsHeader .monoLinkButton');
    return close ? safeFocus(close) : false;
  }

  if (route === '/calendar') {
    if (focusCalendarSelectedDay()) return true;
    return focusCalendarClose();
  }

  if (route === '/settings') {
    if (focusSettingsTabEntry()) return true;
    const close = document.querySelector<HTMLElement>(
      '#settingsView .instructionsHeader .monoLinkButton, [aria-label="Settings"] .instructionsHeader .monoLinkButton'
    );
    return close ? safeFocus(close) : false;
  }

  const close = document.querySelector<HTMLElement>(
    '.instructionsHeader .monoLinkButton, .view .instructionsHeader a'
  );
  return close ? safeFocus(close) : false;
}

export function getCalendarCloseButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[aria-label="Calendar"] .title-bar__closeLink, [aria-label="Calendar"] .instructionsHeader .monoLinkButton'
  );
}

export function getCalendarMonthTabs(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[aria-label="Calendar"] .title-bar__month')].filter(isVisible);
}

export function focusCalendarClose(): boolean {
  return safeFocus(getCalendarCloseButton());
}

export function focusCalendarSelectedDay(): boolean {
  return safeFocus(
    document.querySelector<HTMLElement>('.calendarDayCell--selected') ??
      document.querySelector<HTMLElement>('.calendarDayCell')
  );
}

function calendarGridRows(): number[] {
  return [...document.querySelectorAll<HTMLElement>('.calendarDayCell')]
    .map((cell) => Number(cell.dataset['calendarRow']))
    .filter(Number.isFinite);
}

function focusCalendarCell(month: number, row: number, column: number): boolean {
  const target = document.querySelector<HTMLElement>(
    `.calendarDayCell[data-calendar-month="${month}"]` +
      `[data-calendar-row="${row}"][data-calendar-column="${column}"]`
  );
  if (target) return safeFocus(target);
  return safeFocus(document.querySelector<HTMLElement>('.calendarDayCell--selected'));
}

function stepVisibleCalendarMonth(delta: -1 | 1, row: number | 'last', column: number): boolean {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-calendar-month-step="${delta}"]:not([disabled])`
  );
  if (!button) return false;
  button.click();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const rows = calendarGridRows();
      const lastRow = rows.length ? Math.max(...rows) : 0;
      const targetRow = row === 'last' ? lastRow : row;
      const month = Number(document.querySelector<HTMLElement>('.calendarDayCell')?.dataset['calendarMonth']);
      if (!Number.isFinite(month)) {
        safeFocus(document.querySelector<HTMLElement>('.calendarDayCell--selected'));
        return;
      }
      focusCalendarCell(month, targetRow, column);
    });
  });
  return true;
}

/** Moves calendar focus by its visual seven-column grid coordinates. */
export function moveCalendarFocus(rowDelta: number, columnDelta: number): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.classList.contains('calendarDayCell')) return false;

  const month = Number(active.dataset['calendarMonth']);
  const row = Number(active.dataset['calendarRow']);
  const column = Number(active.dataset['calendarColumn']);
  if (![month, row, column].every(Number.isFinite)) return false;

  const lastRow = Math.max(0, ...calendarGridRows());
  let targetMonth = month;
  let targetRow = row + rowDelta;
  let targetColumn = column + columnDelta;

  if (columnDelta === 1 && targetColumn >= 7) {
    return stepVisibleCalendarMonth(1, row, 0);
  }
  if (columnDelta === -1 && targetColumn < 0) {
    return stepVisibleCalendarMonth(-1, row, 6);
  }
  if (rowDelta === -1 && targetRow < 0) {
    return stepVisibleCalendarMonth(-1, 'last', column);
  }
  if (rowDelta === 1 && targetRow > lastRow) {
    return stepVisibleCalendarMonth(1, 0, column);
  }

  const selector =
    `.calendarDayCell[data-calendar-month="${targetMonth}"]` +
    `[data-calendar-row="${targetRow}"][data-calendar-column="${targetColumn}"]`;
  const target = document.querySelector<HTMLElement>(selector);
  return target ? safeFocus(target) : true;
}

/** In-app route from an anchor href, or null for external / non-nav links. */
export function resolveInternalAppRoute(anchor: HTMLAnchorElement): string | null {
  const raw = anchor.getAttribute('href');
  if (!raw) return null;
  if (/^(https?:|mailto:|tel:|javascript:|#)/i.test(raw) || raw.startsWith('//')) return null;
  if (!raw.startsWith('/')) return null;
  const path = raw.split('?')[0]?.split('#')[0] ?? '/';
  return path || '/';
}

export function getFocusedAnchor(el: Element | null): HTMLAnchorElement | null {
  if (el instanceof HTMLAnchorElement && el.hasAttribute('href')) return el;
  if (el instanceof Element) {
    const anchor = el.closest<HTMLAnchorElement>('a[href]');
    if (anchor) return anchor;
  }
  return null;
}
