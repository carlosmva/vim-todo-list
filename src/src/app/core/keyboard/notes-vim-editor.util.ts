export type VimMode = 'insert' | 'normal' | 'visual';

export function getNoteIdFromEditor(editor: HTMLElement | null): number | null {
  if (!(editor instanceof HTMLElement)) return null;
  const n = Number(editor.dataset['noteId']);
  return Number.isFinite(n) ? n : null;
}

export function getActiveNotesEditorFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const editor = target.closest('.noteEditorArea');
  return editor instanceof HTMLElement ? editor : null;
}

export function isEditableElement(el: Element | null): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

const LINE_BLOCK_SELECTOR = 'li, p, div, pre, blockquote, h1, h2, h3, h4, h5, h6';

export function getCurrentBlockElement(editor: HTMLElement, useFocus = false): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = useFocus ? sel.focusNode : sel.anchorNode;
  if (!node) return null;
  return blockElementAroundNode(editor, node);
}

function blockElementAroundNode(editor: HTMLElement, node: Node): HTMLElement | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!(el instanceof Element) || !editor.contains(el)) return null;
  const block = el.closest(LINE_BLOCK_SELECTOR);
  if (block instanceof HTMLElement && editor.contains(block) && block !== editor) return block;
  return null;
}

function caretRangeFromSelection(editor: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  try {
    const r = sel.getRangeAt(0).cloneRange();
    r.collapse(true);
    if (!editor.contains(r.startContainer)) return null;
    return r;
  } catch {
    return null;
  }
}

function isBrNode(node: Node | null): node is HTMLBRElement {
  return node instanceof HTMLElement && node.tagName === 'BR';
}

function hasVisibleContentAfter(node: Node): boolean {
  let n: Node | null = node.nextSibling;
  while (n) {
    if (isBrNode(n)) return false;
    if (n.nodeType === Node.TEXT_NODE && (n.nodeValue || '').replace(/\u00a0/g, '').trim()) return true;
    if (n.nodeType === Node.ELEMENT_NODE && ((n as Element).textContent || '').replace(/\u00a0/g, '').trim()) {
      return true;
    }
    n = n.nextSibling;
  }
  return false;
}

/** True when a block is one visual row (not a wrapper of several `<br>` lines). */
export function isSingleVisualLineBlock(block: HTMLElement): boolean {
  const brs = [...block.querySelectorAll('br')];
  if (brs.length === 0) return true;
  if (brs.length === 1 && !hasVisibleContentAfter(brs[0])) return true;
  return false;
}

function collapsedRangeBefore(node: Node): Range {
  const r = document.createRange();
  r.setStartBefore(node);
  r.collapse(true);
  return r;
}

function compareCaretToRangeStart(caret: Range, other: Range): number {
  return caret.compareBoundaryPoints(Range.START_TO_START, other);
}

function newlineTextLineRange(textNode: Text, offset: number): Range | null {
  const value = textNode.nodeValue || '';
  if (!value.includes('\n')) return null;
  const start = value.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  let end = value.indexOf('\n', offset);
  const r = document.createRange();
  if (end < 0) {
    const prevNl = value.lastIndexOf('\n', start - 1);
    if (prevNl >= 0) r.setStart(textNode, prevNl);
    else r.setStart(textNode, start);
    r.setEnd(textNode, value.length);
  } else {
    r.setStart(textNode, start);
    r.setEnd(textNode, end + 1);
  }
  return r;
}

function brDelimitedLineRange(root: Node, caret: Range): Range {
  if (caret.startContainer.nodeType === Node.TEXT_NODE) {
    const textLine = newlineTextLineRange(caret.startContainer as Text, caret.startOffset);
    if (textLine) return textLine;
  }

  const brs = [...(root instanceof Element ? root.querySelectorAll('br') : [])];
  let prevBr: Node | null = null;
  let nextBr: Node | null = null;
  for (const br of brs) {
    if (compareCaretToRangeStart(caret, collapsedRangeBefore(br)) <= 0) {
      if (!nextBr) nextBr = br;
    } else {
      prevBr = br;
    }
  }

  const line = document.createRange();
  if (nextBr) {
    if (prevBr) line.setStartAfter(prevBr);
    else line.setStart(root, 0);
    line.setEndAfter(nextBr);
    return line;
  }
  if (prevBr) {
    line.selectNodeContents(root);
    line.setStartBefore(prevBr);
    return line;
  }
  line.selectNodeContents(root);
  return line;
}

/**
 * Range covering the visual row under the caret.
 * Markdown notes are often `line<br>line` inside the editor, not one block per row.
 */
export function lineRangeFromCaret(editor: HTMLElement, caret: Range): Range | null {
  const node = caret.startContainer;
  if (!(node instanceof Node) || !editor.contains(node)) return null;

  const block = blockElementAroundNode(editor, node);
  if (block && isSingleVisualLineBlock(block)) {
    const r = document.createRange();
    r.selectNode(block);
    return r;
  }

  const root = block && editor.contains(block) ? block : editor;
  return brDelimitedLineRange(root, caret);
}

export function getCurrentLineRange(editor: HTMLElement): Range | null {
  const caret = caretRangeFromSelection(editor);
  if (!caret) return null;
  return lineRangeFromCaret(editor, caret);
}

export function getSelectionRangeInEditor(editor: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  try {
    const r = sel.getRangeAt(0);
    if (!r) return null;
    const startOk = r.startContainer instanceof Node && editor.contains(r.startContainer);
    const endOk = r.endContainer instanceof Node && editor.contains(r.endContainer);
    if (!startOk || !endOk) return null;
    return r;
  } catch {
    return null;
  }
}

export function ensureCaretSelectionInEditor(editor: HTMLElement): Range | null {
  const existing = getSelectionRangeInEditor(editor);
  if (existing) return existing;
  collapseSelectionToEditorStart(editor);
  return getSelectionRangeInEditor(editor);
}

export function collapseSelectionToEditorStart(editor: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  try {
    editor.scrollTop = 0;
  } catch {
    // ignore
  }
  ensureNotesEditorCaretInView(editor);
}

export function collapseSelectionToAfterNode(node: Node): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function setCaretInElement(el: Node, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  try {
    r.setStart(el, offset);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  } catch {
    // ignore
  }
}

function findFirstTextNode(root: Node): Text | null {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  return w.nextNode() as Text | null;
}

function findLastTextNode(root: Node): Text | null {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) last = n as Text;
  return last;
}

export function ensureNotesEditorCaretInView(editor: HTMLElement): void {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const r0 = sel.getRangeAt(0);
    if (!(r0?.endContainer instanceof Node) || !editor.contains(r0.endContainer)) return;
    const r = r0.cloneRange();
    r.collapse(true);
    const rects = r.getClientRects();
    const caretRect = rects?.length ? rects[0] : r.getBoundingClientRect();
    if (!caretRect || !(caretRect.width || caretRect.height)) return;
    const editorRect = editor.getBoundingClientRect();
    const pad = 16;
    const tooHigh = caretRect.top < editorRect.top + pad;
    const tooLow = caretRect.bottom > editorRect.bottom - pad;
    if (!tooHigh && !tooLow) return;
    let delta = 0;
    if (tooHigh) delta = caretRect.top - (editorRect.top + pad);
    else if (tooLow) delta = caretRect.bottom - (editorRect.bottom - pad);
    editor.scrollTop = Math.max(0, editor.scrollTop + delta);
  } catch {
    // ignore
  }
}

export function moveSelection(direction: 'forward' | 'backward', granularity: 'character' | 'line'): void {
  const sel = window.getSelection();
  if (!sel || typeof sel.modify !== 'function') return;
  try {
    sel.modify('move', direction, granularity);
  } catch {
    // ignore
  }
  try {
    const active = document.activeElement;
    const editor = active instanceof Element ? active.closest('.noteEditorArea') : null;
    if (editor instanceof HTMLElement) ensureNotesEditorCaretInView(editor);
  } catch {
    // ignore
  }
}

export function extendSelection(direction: 'forward' | 'backward', granularity: 'character' | 'line'): void {
  const sel = window.getSelection();
  if (!sel || typeof sel.modify !== 'function') return;
  try {
    sel.modify('extend', direction, granularity);
  } catch {
    // ignore
  }
  try {
    const active = document.activeElement;
    const editor = active instanceof Element ? active.closest('.noteEditorArea') : null;
    if (editor instanceof HTMLElement) ensureNotesEditorCaretInView(editor);
  } catch {
    // ignore
  }
}

export function vimCaretToStartOfLine(editor: HTMLElement, { firstNonWhitespace } = { firstNonWhitespace: false }): void {
  const block = getCurrentBlockElement(editor) || editor;
  const firstText = findFirstTextNode(block);
  if (!firstText) {
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    r.selectNodeContents(block);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    return;
  }
  let offset = 0;
  if (firstNonWhitespace) {
    const text = firstText.nodeValue || '';
    const m = text.match(/^\s*/);
    offset = m ? m[0].length : 0;
    if (offset > text.length) offset = text.length;
  }
  setCaretInElement(firstText, offset);
  ensureNotesEditorCaretInView(editor);
}

export function vimCaretToEndOfLine(editor: HTMLElement): void {
  const block = getCurrentBlockElement(editor) || editor;
  const lastText = findLastTextNode(block);
  if (!lastText) {
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    r.selectNodeContents(block);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    return;
  }
  const text = lastText.nodeValue || '';
  setCaretInElement(lastText, text.length);
  ensureNotesEditorCaretInView(editor);
}

export function toggleOrInsertLineCheckbox(editor: HTMLElement): void {
  const block =
    getCurrentBlockElement(editor) ||
    (editor.firstElementChild instanceof HTMLElement ? editor.firstElementChild : null) ||
    editor;

  let strike: Element | null = null;
  for (let n = block.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'S') {
      strike = n as Element;
      break;
    }
  }
  if (strike) {
    const text = document.createTextNode(strike.textContent || '');
    block.replaceChild(text, strike);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  const lineText = block.textContent || '';
  while (block.firstChild) block.removeChild(block.firstChild);
  const s = document.createElement('s');
  s.textContent = lineText;
  block.appendChild(s);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

export function removeLeadingLineCheckboxIfAppropriate(editor: HTMLElement, key: string): boolean {
  if (key !== 'Backspace' && key !== 'Delete') return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;

  const block = getCurrentBlockElement(editor) || editor;
  const first = block.firstChild;
  if (
    !(first instanceof HTMLInputElement) ||
    first.type !== 'checkbox' ||
    !first.classList.contains('noteLineCheckbox')
  ) {
    return false;
  }

  const spaceNode = first.nextSibling;
  const atStartOfBlock = (() => {
    if (range.startContainer === block) {
      const off = range.startOffset;
      if (key === 'Backspace') return off <= 2;
      return off <= 1;
    }
    if (spaceNode && range.startContainer === spaceNode && spaceNode.nodeType === Node.TEXT_NODE) {
      const off = range.startOffset;
      if (key === 'Backspace') return off <= 1;
      return off === 0;
    }
    if (key === 'Backspace' && range.startContainer.nodeType === Node.TEXT_NODE) {
      const textNode = range.startContainer;
      if (range.startOffset !== 0) return false;
      const prev = textNode.previousSibling;
      if (prev === spaceNode || prev === first) return true;
    }
    return false;
  })();

  if (!atStartOfBlock) return false;
  try {
    first.remove();
    if (spaceNode && spaceNode.nodeType === Node.TEXT_NODE) {
      const v = spaceNode.nodeValue || '';
      if (/^\s*$/.test(v)) spaceNode.remove();
      else if (v.startsWith(' ')) spaceNode.nodeValue = v.slice(1);
    }
  } catch {
    // ignore
  }
  try {
    const r = document.createRange();
    r.selectNodeContents(block);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  } catch {
    // ignore
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

type VisualTarget =
  | 'startOfLine'
  | 'startOfLineNonWhitespace'
  | 'endOfLine'
  | 'startOfDocument'
  | 'endOfDocument';

function getTargetPositionForVisual(editor: HTMLElement, target: VisualTarget) {
  if (target === 'startOfDocument') {
    const r = document.createRange();
    r.selectNodeContents(editor);
    r.collapse(true);
    return { node: r.startContainer, offset: r.startOffset };
  }
  if (target === 'endOfDocument') {
    const r = document.createRange();
    r.selectNodeContents(editor);
    r.collapse(false);
    return { node: r.endContainer, offset: r.endOffset };
  }
  const block = getCurrentBlockElement(editor, true) || editor;
  if (target === 'startOfLine') {
    const firstText = findFirstTextNode(block);
    if (!firstText) {
      const r = document.createRange();
      r.selectNodeContents(block);
      r.collapse(true);
      return { node: r.startContainer, offset: r.startOffset };
    }
    return { node: firstText, offset: 0 };
  }
  if (target === 'startOfLineNonWhitespace') {
    const firstText = findFirstTextNode(block);
    if (!firstText) {
      const r = document.createRange();
      r.selectNodeContents(block);
      r.collapse(true);
      return { node: r.startContainer, offset: r.startOffset };
    }
    const text = firstText.nodeValue || '';
    const m = text.match(/^\s*/);
    const offset = m ? m[0].length : 0;
    return { node: firstText, offset: Math.min(offset, text.length) };
  }
  if (target === 'endOfLine') {
    const lastText = findLastTextNode(block);
    if (!lastText) {
      const r = document.createRange();
      r.selectNodeContents(block);
      r.collapse(false);
      return { node: r.endContainer, offset: r.endOffset };
    }
    const text = lastText.nodeValue || '';
    return { node: lastText, offset: text.length };
  }
  return null;
}

function comparePositions(nodeA: Node, offsetA: number, nodeB: Node, offsetB: number): number {
  const ra = document.createRange();
  ra.setStart(nodeA, offsetA);
  ra.collapse(true);
  const rb = document.createRange();
  rb.setStart(nodeB, offsetB);
  rb.collapse(true);
  return ra.compareBoundaryPoints(Range.START_TO_END, rb);
}

export function extendSelectionToTarget(
  editor: HTMLElement,
  anchor: Range,
  target: VisualTarget
): void {
  const pos = getTargetPositionForVisual(editor, target);
  if (!pos) return;
  try {
    const cmp = comparePositions(anchor.startContainer, anchor.startOffset, pos.node, pos.offset);
    const r = document.createRange();
    if (cmp <= 0) {
      r.setStart(anchor.startContainer, anchor.startOffset);
      r.setEnd(pos.node, pos.offset);
    } else {
      r.setStart(pos.node, pos.offset);
      r.setEnd(anchor.startContainer, anchor.startOffset);
    }
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(r);
    }
    if (target === 'startOfDocument') editor.scrollTop = 0;
    else if (target === 'endOfDocument') editor.scrollTop = editor.scrollHeight;
    ensureNotesEditorCaretInView(editor);
  } catch {
    // ignore
  }
}

export function vimDeleteSelection(editor: HTMLElement): boolean {
  const r = getSelectionRangeInEditor(editor);
  if (!r || r.collapsed) return false;
  try {
    editor.focus();
    if (document.queryCommandSupported?.('delete') && document.execCommand('delete')) return true;
  } catch {
    // ignore
  }
  try {
    r.deleteContents();
    return true;
  } catch {
    return false;
  }
}

function seedEmptyEditorLine(editor: HTMLElement): void {
  editor.innerHTML = '<div><br></div>';
  collapseSelectionToEditorStart(editor);
}

export function vimDeleteCurrentBlock(editor: HTMLElement): void {
  const line = getCurrentLineRange(editor);
  if (!line) {
    seedEmptyEditorLine(editor);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  try {
    editor.focus();
    line.deleteContents();
  } catch {
    try {
      const block = getCurrentBlockElement(editor);
      if (block && isSingleVisualLineBlock(block)) block.remove();
    } catch {
      // ignore
    }
  }

  if (!editor.innerHTML.trim()) seedEmptyEditorLine(editor);
  else {
    const sel = window.getSelection();
    if (sel) {
      try {
        sel.removeAllRanges();
        sel.addRange(line);
      } catch {
        collapseSelectionToEditorStart(editor);
      }
    }
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

export interface RegisterValue {
  html: string;
  text: string;
}

export function vimWriteClipboard(
  { text, html }: { text: string; html: string },
  { editor }: { editor?: HTMLElement } = {}
): boolean {
  const plain = String(text || '');
  const markup = typeof html === 'string' ? html : '';
  if (!plain && !markup) return false;

  const plainFromHtml = (inputHtml: string) => {
    try {
      const wrap = document.createElement('div');
      wrap.innerHTML = inputHtml;
      return wrap.innerText || wrap.textContent || '';
    } catch {
      return '';
    }
  };

  const prevActive = document.activeElement;
  const sel = window.getSelection();
  const ranges: Range[] = [];
  if (sel) {
    for (let i = 0; i < sel.rangeCount; i++) {
      try {
        ranges.push(sel.getRangeAt(i).cloneRange());
      } catch {
        // ignore
      }
    }
  }

  let ok = false;
  const copyPlain = plain || plainFromHtml(markup);
  const copyHtml = markup || '';
  const container = document.createElement('div');
  container.setAttribute('contenteditable', 'true');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
  container.innerHTML = copyHtml || '';
  if (!copyHtml) container.textContent = copyPlain;

  const onCopy = (ev: ClipboardEvent) => {
    try {
      if (!ev.clipboardData) return;
      if (copyPlain) ev.clipboardData.setData('text/plain', copyPlain);
      if (copyHtml) ev.clipboardData.setData('text/html', copyHtml);
      ev.preventDefault();
      ok = true;
    } catch {
      // ignore
    }
  };

  try {
    document.addEventListener('copy', onCopy, true);
    document.body.appendChild(container);
    const r = document.createRange();
    r.selectNodeContents(container);
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(r);
    }
    ok = ok || !!document.execCommand('copy');
  } catch {
    // ignore
  } finally {
    document.removeEventListener('copy', onCopy, true);
    container.remove();
    try {
      if (editor instanceof HTMLElement) editor.focus();
      else if (prevActive instanceof HTMLElement) prevActive.focus();
    } catch {
      // ignore
    }
    try {
      if (sel && ranges.length) {
        sel.removeAllRanges();
        for (const rr of ranges) sel.addRange(rr);
      }
    } catch {
      // ignore
    }
  }
  return ok;
}

export function vimPasteAtCaret(editor: HTMLElement, reg: RegisterValue | null): boolean {
  if (!reg || (!reg.html && !reg.text)) return false;
  const r = ensureCaretSelectionInEditor(editor);
  if (!r) return false;

  const tryInsertHtml = (html: string) => {
    if (!html) return false;
    try {
      editor.focus();
      return document.execCommand('insertHTML', false, html);
    } catch {
      return false;
    }
  };
  const tryInsertText = (text: string) => {
    if (!text) return false;
    try {
      editor.focus();
      return document.execCommand('insertText', false, text);
    } catch {
      return false;
    }
  };

  if (!tryInsertHtml(reg.html)) {
    if (!tryInsertText(reg.text)) {
      try {
        const sel = window.getSelection();
        if (!sel?.rangeCount) return false;
        const rr = sel.getRangeAt(0);
        rr.deleteContents();
        if (reg.html) {
          const tpl = document.createElement('template');
          tpl.innerHTML = reg.html;
          const frag = tpl.content;
          const last = frag.lastChild;
          rr.insertNode(frag);
          if (last) collapseSelectionToAfterNode(last);
        } else if (reg.text) {
          rr.insertNode(document.createTextNode(reg.text));
        }
      } catch {
        return false;
      }
    }
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

export function yankFromRange(editor: HTMLElement, r: Range): { html: string; text: string } {
  let html = '';
  let text = '';
  try {
    text = r.toString();
    const frag = r.cloneContents();
    const wrap = document.createElement('div');
    wrap.appendChild(frag);
    html = wrap.innerHTML;
    if (!text) text = wrap.innerText || wrap.textContent || '';
  } catch {
    // ignore
  }
  return { html, text };
}

export function yankCurrentBlock(editor: HTMLElement): { html: string; text: string } {
  const line = getCurrentLineRange(editor);
  if (line) return yankFromRange(editor, line);
  const block = getCurrentBlockElement(editor);
  if (block && isSingleVisualLineBlock(block)) {
    return { html: block.outerHTML, text: block.textContent || '' };
  }
  return { html: '', text: '' };
}

export function updateVimStatusInDom(noteId: number, status: string): void {
  const el = document.querySelector(
    `.noteVimStatus[data-note-id="${CSS.escape(String(noteId))}"]`
  );
  if (el instanceof HTMLElement) el.textContent = status;
}

export function showVimToast(noteId: number, message: string, ms = 900): void {
  const el = document.querySelector(
    `.noteVimToast[data-note-id="${CSS.escape(String(noteId))}"]`
  );
  if (!(el instanceof HTMLElement)) return;
  const msg = String(message || '').trim();
  if (!msg) return;
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => {
    el.hidden = true;
    el.textContent = '';
  }, Math.max(250, ms));
}
