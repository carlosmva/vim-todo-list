import { ensureCardFullyVisible, safeFocus } from './keyboard-focus.util';

export function isInLinksPanel(el: Element | null): boolean {
  if (!(el instanceof Element)) return false;
  const card = el.closest('.noteCard.is-flipped[data-note-id]');
  return card instanceof HTMLElement && card.contains(el);
}

export function getFlippedCardFromElement(el: Element | null): HTMLElement | null {
  if (!(el instanceof Element)) return null;
  const card = el.closest('.noteCard.is-flipped[data-note-id]');
  return card instanceof HTMLElement ? card : null;
}

interface LinksEntryControls {
  description: HTMLInputElement | null;
  url: HTMLInputElement | null;
  back: HTMLButtonElement | null;
  addLink: HTMLButtonElement | null;
}

function getLinksEntryControls(card: HTMLElement): LinksEntryControls {
  return {
    description: card.querySelector<HTMLInputElement>(".linkForm input[name='description']"),
    url: card.querySelector<HTMLInputElement>(".linkForm input[name='url']"),
    back: card.querySelector<HTMLButtonElement>("button[data-action='unflip']"),
    addLink: card.querySelector<HTMLButtonElement>('.linksEntryGrid__add'),
  };
}

function focusLinksControl(node: HTMLElement | null): boolean {
  if (!node) return false;
  const ok = safeFocus(node);
  const card = node.closest('.noteCard');
  if (card instanceof HTMLElement) ensureCardFullyVisible(card);
  return ok;
}

function moveLinksEntryVertical(card: HTMLElement, delta: number): boolean {
  const { description, url, back, addLink } = getLinksEntryControls(card);
  const active = document.activeElement;

  if (active === description) {
    if (delta > 0) return focusLinksControl(back);
    return false;
  }
  if (active === back) {
    if (delta < 0) return focusLinksControl(description);
    return moveToFirstLinkRow(card, 'left');
  }
  if (active === url) {
    if (delta > 0) return focusLinksControl(addLink);
    return false;
  }
  if (active === addLink) {
    if (delta < 0) return focusLinksControl(url);
    return moveToFirstLinkRow(card, 'right');
  }
  return false;
}

function moveLinksEntryHorizontal(card: HTMLElement, delta: number): boolean {
  const { description, url, back, addLink } = getLinksEntryControls(card);
  const active = document.activeElement;

  if (active === description) {
    if (delta > 0) return focusLinksControl(url);
    return false;
  }
  if (active === url) {
    if (delta < 0) return focusLinksControl(description);
    return false;
  }
  if (active === back) {
    if (delta > 0) return focusLinksControl(addLink);
    return false;
  }
  if (active === addLink) {
    if (delta < 0) return focusLinksControl(back);
    return false;
  }
  return false;
}

function moveToFirstLinkRow(card: HTMLElement, column: 'left' | 'right'): boolean {
  const firstRow = card.querySelector<HTMLElement>('.linkList .linkRow');
  if (!firstRow) return false;
  const target =
    column === 'right'
      ? firstRow.querySelector<HTMLElement>('button')
      : firstRow.querySelector<HTMLElement>('a[href]');
  return focusLinksControl(target);
}

function moveFromLinkRowVertical(card: HTMLElement, delta: number): boolean {
  const active = document.activeElement;
  if (!(active instanceof Element)) return false;
  const currentRow = active.closest('.linkRow');
  if (!(currentRow instanceof HTMLElement)) return false;

  const rows = [...card.querySelectorAll<HTMLElement>('.linkList .linkRow')];
  const currentIdx = rows.indexOf(currentRow);
  if (currentIdx < 0) return false;

  if (delta > 0) {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= rows.length) return false;
    return focusLinkRowControl(rows[nextIdx], active instanceof HTMLButtonElement);
  }

  if (currentIdx > 0) {
    const prevRow = rows[currentIdx - 1];
    return focusLinkRowControl(prevRow, active instanceof HTMLButtonElement);
  }

  const { back, addLink } = getLinksEntryControls(card);
  if (active instanceof HTMLButtonElement) return focusLinksControl(addLink);
  return focusLinksControl(back);
}

function focusLinkRowControl(row: HTMLElement, preferDelete: boolean): boolean {
  const preferred = preferDelete
    ? row.querySelector<HTMLElement>('button')
    : row.querySelector<HTMLElement>('a[href]');
  const fallback = row.querySelector<HTMLElement>('a[href], button');
  return focusLinksControl((preferred ?? fallback) as HTMLElement | null);
}

export function moveFocusWithinLinksRows(card: HTMLElement, deltaRows: number): boolean {
  const active = document.activeElement;
  if (!(active instanceof Element)) return false;
  const currentRow = active.closest('.linkRow');
  if (!(currentRow instanceof HTMLElement)) return false;

  const rows = [...card.querySelectorAll<HTMLElement>('.linkList .linkRow')];
  if (!rows.length) return false;

  const currentIdx = rows.indexOf(currentRow);
  if (currentIdx < 0) return false;

  const nextIdx = Math.min(rows.length - 1, Math.max(0, currentIdx + deltaRows));
  if (nextIdx === currentIdx) return false;

  return focusLinkRowControl(rows[nextIdx], active instanceof HTMLButtonElement);
}

export function handleLinksPanelModNav(
  key: string,
  nav: { up: string; down: string; left: string; right: string },
  card: HTMLElement
): boolean {
  const isUp = key === nav.up;
  const isDown = key === nav.down;
  const isLeft = key === nav.left;
  const isRight = key === nav.right;
  if (!isUp && !isDown && !isLeft && !isRight) return false;

  const active = document.activeElement;
  const inLinkRow = active instanceof Element && !!active.closest('.linkRow');
  const controls = getLinksEntryControls(card);
  const inEntryGrid =
    active === controls.description ||
    active === controls.url ||
    active === controls.back ||
    active === controls.addLink;

  if (isUp || isDown) {
    if (inLinkRow) {
      if (moveFromLinkRowVertical(card, isDown ? 1 : -1)) return true;
      return false;
    }
    if (inEntryGrid) {
      return moveLinksEntryVertical(card, isDown ? 1 : -1);
    }
  }

  if (isLeft || isRight) {
    if (inLinkRow) {
      const row = active.closest('.linkRow');
      if (row instanceof HTMLElement) {
        const link = row.querySelector<HTMLElement>('a[href]');
        const del = row.querySelector<HTMLElement>('button');
        if (isLeft && active !== link && link) return focusLinksControl(link);
        if (isRight && active !== del && del) return focusLinksControl(del);
      }
      return false;
    }
    if (inEntryGrid) {
      return moveLinksEntryHorizontal(card, isRight ? 1 : -1);
    }
  }

  return false;
}
