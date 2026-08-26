function getVisibleCardFace(card: HTMLElement): HTMLElement | null {
  if (card.classList.contains('is-flipped')) {
    const back = card.querySelector('.noteBack');
    return back instanceof HTMLElement ? back : null;
  }
  const front = card.querySelector('.noteFace:not(.noteBack)');
  return front instanceof HTMLElement ? front : null;
}

function measureCardTargetHeight(card: HTMLElement): number {
  const face = getVisibleCardFace(card);
  const computed = window.getComputedStyle(card);
  const minRaw = parseFloat(computed.minHeight || '');
  const maxRaw = parseFloat(computed.maxHeight || '');
  const minH = Number.isFinite(minRaw) ? minRaw : 96;
  const maxH = Number.isFinite(maxRaw) ? maxRaw : Number.POSITIVE_INFINITY;

  let target = 96;
  if (!(face instanceof HTMLElement)) {
    const h = Math.ceil(card.getBoundingClientRect().height);
    target = Number.isFinite(h) && h > 0 ? h : 96;
  } else {
    const measured = Math.ceil(face.scrollHeight);
    target = Number.isFinite(measured) ? measured : 96;
  }

  target = Math.max(minH, target);
  target = Math.min(maxH, target);
  return Math.max(96, target);
}

/** Animate card height to match the visible face (front, back, or editor). */
export function morphCardHeight(card: HTMLElement): void {
  const start = Math.ceil(card.getBoundingClientRect().height);
  const target = measureCardTargetHeight(card);
  if (!Number.isFinite(start) || start <= 0) return;
  if (Math.abs(target - start) < 2) return;

  card.classList.add('is-morphing');
  card.style.height = `${start}px`;
  void card.offsetHeight;
  card.style.height = `${target}px`;

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    card.classList.remove('is-morphing');
    card.style.height = '';
    card.removeEventListener('transitionend', onEnd);
  };

  const onEnd = (e: TransitionEvent) => {
    if (e.target !== card || e.propertyName !== 'height') return;
    cleanup();
  };

  card.addEventListener('transitionend', onEnd);
  setTimeout(cleanup, 320);
}

export function morphCardHeightByNoteId(noteId: number): void {
  const card = document.querySelector<HTMLElement>(
    `.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`
  );
  if (card) morphCardHeight(card);
}
