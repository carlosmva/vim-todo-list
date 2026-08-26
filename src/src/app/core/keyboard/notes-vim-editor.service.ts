import { Injectable, inject } from '@angular/core';
import { NotesKeyboardBridge } from './notes-keyboard-bridge.service';
import { focusCardPrimaryAction, getCardFromElement, safeFocus } from './keyboard-focus.util';
import {
  RegisterValue,
  VimMode,
  collapseSelectionToEditorStart,
  ensureCaretSelectionInEditor,
  extendSelection,
  extendSelectionToTarget,
  getActiveNotesEditorFromTarget,
  getNoteIdFromEditor,
  getSelectionRangeInEditor,
  isEditableElement,
  moveSelection,
  removeLeadingLineCheckboxIfAppropriate,
  showVimToast,
  updateVimStatusInDom,
  vimCaretToEndOfLine,
  vimCaretToStartOfLine,
  vimDeleteCurrentBlock,
  vimDeleteSelection,
  vimPasteAtCaret,
  vimWriteClipboard,
  yankCurrentBlock,
  yankFromRange,
} from './notes-vim-editor.util';

interface PendingKey {
  key: string;
  at: number;
}

@Injectable({ providedIn: 'root' })
export class NotesVimEditorService {
  private readonly bridge = inject(NotesKeyboardBridge);
  private attached = false;
  private lastFocusedEditor: HTMLElement | null = null;

  private readonly modeByNoteId = new Map<number, VimMode>();
  private readonly pendingByNoteId = new Map<number, PendingKey>();
  private readonly visualAnchorByNoteId = new Map<number, Range>();
  private readonly undoStackByNoteId = new Map<number, string[]>();
  private readonly undoMetaByNoteId = new Map<number, { lastPushAt: number }>();
  private readonly undoApplying = new Set<number>();
  private readonly registersByNoteId = new Map<number, Map<string, RegisterValue>>();
  private readonly nextRegisterByNoteId = new Map<number, string>();

  private notesExitPending: { noteId: number; range: Range | null; timer: ReturnType<typeof setTimeout> } | null =
    null;
  private readonly saveTimers = new Map<number, ReturnType<typeof setTimeout>>();

  attach(): void {
    if (this.attached || typeof document === 'undefined') return;
    this.attached = true;
    document.addEventListener('focusin', this.onFocusIn, true);
    document.addEventListener('focusout', this.onFocusOut, true);
    document.addEventListener('input', this.onInput, true);
    document.addEventListener('keydown', this.onEscape, true);
    document.addEventListener('keydown', this.onEditorKeyDown, true);
  }

  detach(): void {
    if (!this.attached) return;
    document.removeEventListener('focusin', this.onFocusIn, true);
    document.removeEventListener('focusout', this.onFocusOut, true);
    document.removeEventListener('input', this.onInput, true);
    document.removeEventListener('keydown', this.onEscape, true);
    document.removeEventListener('keydown', this.onEditorKeyDown, true);
    this.attached = false;
  }

  getMode(noteId: number): VimMode {
    return this.modeByNoteId.get(noteId) || 'insert';
  }

  /** Focus the notes editor for a card and enter insert mode (e.g. after opening via Notes button). */
  focusEditorForEditing(noteId: number): boolean {
    const editor = document.querySelector(
      `.noteEditorArea[data-note-id="${CSS.escape(String(noteId))}"]`
    );
    if (!(editor instanceof HTMLElement)) return false;
    this.clearPending(noteId);
    this.setMode(noteId, 'insert');
    return safeFocus(editor);
  }

  private onFocusIn = (e: FocusEvent): void => {
    const editor = getActiveNotesEditorFromTarget(e.target);
    if (!editor) return;
    this.lastFocusedEditor = editor;
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return;
    if (!this.modeByNoteId.has(noteId)) this.setMode(noteId, 'insert');
    const stack = this.getUndoStack(noteId);
    if (!stack.length) this.undoPush(noteId, editor.innerHTML, { force: true });
    this.refreshStatus(noteId);
  };

  private onInput = (e: Event): void => {
    const editor = getActiveNotesEditorFromTarget(e.target);
    if (!editor) return;
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null || this.undoApplying.has(noteId)) return;
    this.undoPush(noteId, editor.innerHTML);
    this.scheduleSave(noteId);
  };

  private onFocusOut = (e: FocusEvent): void => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains('noteEditorArea')) return;
    const related = e.relatedTarget;
    const wrap = target.closest('.noteEditor');
    if (related instanceof Node && wrap instanceof HTMLElement && wrap.contains(related)) return;
    const noteId = getNoteIdFromEditor(target);
    if (noteId === null) return;
    void this.flushSave(noteId);
  };

  private onEscape = (e: KeyboardEvent): void => {
    if (document.getElementById('obsidianConflictModal')) return;
    if (e.key !== 'Escape' || e.ctrlKey || e.metaKey || e.altKey) return;
    const bridge = this.bridge.get();
    if (!bridge?.hasOpenEditor()) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    let card = getCardFromElement(document.activeElement);
    let noteId = card ? Number(card.dataset['noteId']) : NaN;
    const openIds = bridge.openEditorIds?.() ?? [];
    if (!Number.isFinite(noteId) || !openIds.includes(noteId)) {
      noteId = openIds[0] ?? NaN;
      card = document.querySelector(`.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`);
    }
    if (!Number.isFinite(noteId) || !(card instanceof HTMLElement)) return;

    const mode = this.getMode(noteId);
    if (mode === 'insert') {
      this.notesExitPending = null;
      this.clearPending(noteId);
      this.setMode(noteId, 'normal');
      const editor = card.querySelector('.noteEditorArea');
      if (editor instanceof HTMLElement) safeFocus(editor);
      return;
    }

    if (mode === 'visual') {
      this.notesExitPending = null;
      this.clearPending(noteId);
      const editorArea = card.querySelector('.noteEditorArea');
      if (editorArea instanceof HTMLElement) {
        editorArea.focus();
        this.exitVisualMode(editorArea);
      } else {
        this.setMode(noteId, 'normal');
      }
      return;
    }

    this.notesExitPending = null;
    bridge.closeEditor(noteId);
    const notesBtn = [...card.querySelectorAll<HTMLElement>('button')].find((b) =>
      /notes/i.test(b.textContent || '')
    );
    if (notesBtn && safeFocus(notesBtn)) return;
    focusCardPrimaryAction(card);
  };

  private onEditorKeyDown = (e: KeyboardEvent): void => {
    if (document.getElementById('obsidianConflictModal')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const target = e.target;
    let editor = getActiveNotesEditorFromTarget(target);
    if (!editor) {
      const active = document.activeElement;
      if (active && isEditableElement(active)) return;
      if (this.lastFocusedEditor instanceof HTMLElement) {
        const noteId = getNoteIdFromEditor(this.lastFocusedEditor);
        const bridge = this.bridge.get();
        if (noteId !== null && bridge?.isEditorOpen?.(noteId)) editor = this.lastFocusedEditor;
      }
    }
    if (!(editor instanceof HTMLElement)) return;
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return;

    const key = e.key;
    if (key === 'Backspace' || key === 'Delete') {
      if (removeLeadingLineCheckboxIfAppropriate(editor, key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    this.handleNotesExitSequence(e, editor, noteId, key);

    const mode = this.getMode(noteId);
    if (mode === 'insert') return;

    if (key === 'Shift' || key === 'CapsLock' || key === 'AltGraph') return;

    const k0Normalized = key === '=' ? '+' : key;
    if (this.pendingIs(noteId, '"', 4000) && /^[0-4+]$/.test(k0Normalized)) {
      e.preventDefault();
      editor.focus();
      this.setNextRegister(noteId, k0Normalized);
      this.clearPending(noteId);
      return;
    }

    if (mode === 'visual') {
      this.handleVisualKey(e, editor, noteId, key);
      return;
    }

    this.handleNormalKey(e, editor, noteId, key);
  };

  private handleNotesExitSequence(e: KeyboardEvent, editor: HTMLElement, noteId: number, key: string): void {
    const inEditor =
      e.target instanceof Element &&
      (e.target.closest('.noteEditorArea') || e.target.closest('.noteEditor'));
    if (!inEditor) return;

    if (this.notesExitPending) {
      const pending = this.notesExitPending;
      this.notesExitPending = null;
      clearTimeout(pending.timer);
      if (key === 'x' || key === 'q') {
        e.preventDefault();
        e.stopPropagation();
        this.closeEditorFromCommand(pending.noteId, key === 'x');
        return;
      }
      try {
        if (pending.range) {
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(pending.range);
          }
        }
        document.execCommand('insertText', false, ':');
      } catch {
        // ignore
      }
    }

    if (key === ':') {
      e.preventDefault();
      e.stopPropagation();
      let range: Range | null = null;
      try {
        const sel = window.getSelection();
        if (sel?.rangeCount) range = sel.getRangeAt(0).cloneRange();
      } catch {
        // ignore
      }
      const timer = setTimeout(() => {
        if (!this.notesExitPending) return;
        const p = this.notesExitPending;
        this.notesExitPending = null;
        try {
          const curActive = document.activeElement;
          const stillInSameEditor =
            curActive instanceof Element &&
            curActive.closest(`.noteCard[data-note-id="${CSS.escape(String(p.noteId))}"]`) !== null;
          if (!stillInSameEditor) return;
          if (p.range) {
            const sel = window.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(p.range);
            }
          }
          document.execCommand('insertText', false, ':');
        } catch {
          // ignore
        }
      }, 700);
      this.notesExitPending = { noteId, range, timer };
    }
  }

  private handleVisualKey(e: KeyboardEvent, editor: HTMLElement, noteId: number, key: string): void {
    const anchor = this.visualAnchorByNoteId.get(noteId);
    if (key === '"') {
      e.preventDefault();
      editor.focus();
      this.setPending(noteId, '"');
      return;
    }
    const navMap: Record<string, () => void> = {
      h: () => extendSelection('backward', 'character'),
      l: () => extendSelection('forward', 'character'),
      j: () => extendSelection('forward', 'line'),
      k: () => extendSelection('backward', 'line'),
      ArrowLeft: () => extendSelection('backward', 'character'),
      ArrowRight: () => extendSelection('forward', 'character'),
      ArrowUp: () => extendSelection('backward', 'line'),
      ArrowDown: () => extendSelection('forward', 'line'),
    };
    if (navMap[key]) {
      e.preventDefault();
      editor.focus();
      navMap[key]();
      this.clearPending(noteId);
      return;
    }
    const targetMap: Record<string, Parameters<typeof extendSelectionToTarget>[2]> = {
      '0': 'startOfLine',
      '^': 'startOfLineNonWhitespace',
      $: 'endOfLine',
      G: 'endOfDocument',
    };
    if (targetMap[key] && anchor) {
      e.preventDefault();
      editor.focus();
      extendSelectionToTarget(editor, anchor, targetMap[key]);
      this.clearPending(noteId);
      return;
    }
    if (key === 'g') {
      e.preventDefault();
      editor.focus();
      if (this.pendingIs(noteId, 'g', 700) && anchor) {
        extendSelectionToTarget(editor, anchor, 'startOfDocument');
        this.clearPending(noteId);
      } else {
        this.setPending(noteId, 'g');
      }
      return;
    }
    if (key === 'y') {
      e.preventDefault();
      editor.focus();
      const regName = this.getOpRegisterName(noteId);
      const res = this.yankSelection(editor, noteId, regName);
      if (res.ok) {
        showVimToast(
          noteId,
          regName === '+' ? (res.clipboardOk ? 'Copied to clipboard (+)' : 'Yanked to + (clipboard blocked)') : `Yanked to register ${regName}`
        );
      }
      this.exitVisualMode(editor);
      return;
    }
    if (key === 'c') {
      e.preventDefault();
      editor.focus();
      const regName = this.getOpRegisterName(noteId);
      const res = this.yankSelection(editor, noteId, regName);
      const deleted = vimDeleteSelection(editor);
      if (res.ok && deleted) {
        showVimToast(
          noteId,
          regName === '+' ? (res.clipboardOk ? 'Cut to clipboard (+)' : 'Cut to + (clipboard blocked)') : `Cut to register ${regName}`
        );
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      this.setMode(noteId, 'insert');
      this.clearPending(noteId);
      return;
    }
    if (typeof key === 'string' && key.length === 1) {
      e.preventDefault();
      editor.focus();
    }
    this.clearPending(noteId);
  }

  private handleNormalKey(e: KeyboardEvent, editor: HTMLElement, noteId: number, key: string): void {
    const handled = new Set([
      'h', 'j', 'k', 'l', 'i', 'a', 'v', 'u', '0', '^', ':', 'x', 'q', 'g', 'G', 'd', 'y', 'p', '$', '"',
    ]);
    if (!handled.has(key)) {
      this.clearPending(noteId);
      return;
    }

    e.preventDefault();
    editor.focus();

    if (key === 'i') {
      this.setMode(noteId, 'insert');
      this.clearPending(noteId);
      return;
    }
    if (key === 'v') {
      this.clearPending(noteId);
      this.enterVisualMode(editor);
      return;
    }
    if (key === 'a') {
      moveSelection('forward', 'character');
      this.setMode(noteId, 'insert');
      this.clearPending(noteId);
      return;
    }
    if (key === 'u') {
      this.clearPending(noteId);
      if (this.undoApply(editor, noteId)) showVimToast(noteId, 'Undo');
      return;
    }
    if (key === ':') {
      this.setPending(noteId, ':');
      return;
    }
    if (key === 'x' || key === 'q') {
      if (this.pendingIs(noteId, ':', 4000)) {
        this.closeEditorFromCommand(noteId, key === 'x');
      }
      this.clearPending(noteId);
      return;
    }
    if (key === '"') {
      this.setPending(noteId, '"');
      return;
    }
    if (key === 'h') {
      moveSelection('backward', 'character');
      this.clearPending(noteId);
      return;
    }
    if (key === 'l') {
      moveSelection('forward', 'character');
      this.clearPending(noteId);
      return;
    }
    if (key === 'j') {
      moveSelection('forward', 'line');
      this.clearPending(noteId);
      return;
    }
    if (key === 'k') {
      moveSelection('backward', 'line');
      this.clearPending(noteId);
      return;
    }
    if (key === '0') {
      vimCaretToStartOfLine(editor, { firstNonWhitespace: false });
      this.clearPending(noteId);
      return;
    }
    if (key === '^') {
      vimCaretToStartOfLine(editor, { firstNonWhitespace: true });
      this.clearPending(noteId);
      return;
    }
    if (key === '$') {
      vimCaretToEndOfLine(editor);
      this.clearPending(noteId);
      return;
    }
    if (key === 'g') {
      if (this.pendingIs(noteId, 'g', 700)) {
        collapseSelectionToEditorStart(editor);
        this.clearPending(noteId);
      } else {
        this.setPending(noteId, 'g');
      }
      return;
    }
    if (key === 'G') {
      const sel = window.getSelection();
      if (sel) {
        const r = document.createRange();
        r.selectNodeContents(editor);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      editor.scrollTop = editor.scrollHeight;
      this.clearPending(noteId);
      return;
    }
    if (key === 'd') {
      if (this.pendingIs(noteId, 'd', 700)) {
        vimDeleteCurrentBlock(editor);
        showVimToast(noteId, 'Deleted block');
        this.clearPending(noteId);
      } else {
        this.setPending(noteId, 'd');
      }
      return;
    }
    if (key === 'y') {
      if (this.pendingIs(noteId, 'y', 700)) {
        const regName = this.getOpRegisterName(noteId);
        const res = this.yankBlock(editor, noteId, regName);
        if (res.ok) {
          showVimToast(
            noteId,
            regName === '+'
              ? res.clipboardOk
                ? 'Copied block to clipboard (+)'
                : 'Yanked block to + (clipboard blocked)'
              : `Yanked block to register ${regName}`
          );
        }
        this.clearPending(noteId);
      } else {
        this.setPending(noteId, 'y');
      }
      return;
    }
    if (key === 'p') {
      const regName = this.getOpRegisterName(noteId);
      if (vimPasteAtCaret(editor, this.getRegister(noteId, regName))) {
        showVimToast(noteId, `Pasted from register ${regName}`);
      }
      this.setMode(noteId, 'insert');
      this.clearPending(noteId);
    }
  };

  private closeEditorFromCommand(noteId: number, save: boolean): void {
    this.notesExitPending = null;
    this.clearPending(noteId);
    const bridge = this.bridge.get();
    if (!bridge) return;
    if (save) {
      void this.flushSave(noteId).then(() => bridge.closeEditor(noteId));
      return;
    }
    this.cancelSave(noteId);
    bridge.closeEditor(noteId);
  }

  private scheduleSave(noteId: number): void {
    const existing = this.saveTimers.get(noteId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.saveTimers.delete(noteId);
      void this.bridge.get()?.saveEditorHtml(noteId);
    }, 350);
    this.saveTimers.set(noteId, timer);
  }

  private cancelSave(noteId: number): void {
    const timer = this.saveTimers.get(noteId);
    if (timer) {
      clearTimeout(timer);
      this.saveTimers.delete(noteId);
    }
  }

  private flushSave(noteId: number): Promise<void> {
    this.cancelSave(noteId);
    return this.bridge.get()?.saveEditorHtml(noteId) ?? Promise.resolve();
  }

  private setMode(noteId: number, mode: VimMode): void {
    if (mode !== 'insert' && mode !== 'normal' && mode !== 'visual') return;
    this.modeByNoteId.set(noteId, mode);
    if (mode !== 'visual') this.visualAnchorByNoteId.delete(noteId);
    this.refreshStatus(noteId);
  }

  private enterVisualMode(editor: HTMLElement): void {
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return;
    const r = ensureCaretSelectionInEditor(editor);
    if (r) this.visualAnchorByNoteId.set(noteId, r.cloneRange());
    this.setMode(noteId, 'visual');
  }

  private exitVisualMode(editor: HTMLElement): void {
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return;
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      try {
        sel.collapseToEnd();
      } catch {
        // ignore
      }
    }
    this.setMode(noteId, 'normal');
    this.clearPending(noteId);
    this.nextRegisterByNoteId.delete(noteId);
  }

  private refreshStatus(noteId: number): void {
    const mode = String(this.getMode(noteId) || 'insert').toUpperCase();
    const pending = this.getPendingStatus(noteId);
    const nextReg = this.nextRegisterByNoteId.get(noteId);
    let s = mode;
    if (pending) s += `  |  PENDING: ${pending}`;
    if (nextReg) s += `  |  REG: ${nextReg}`;
    updateVimStatusInDom(noteId, s);
  }

  private getPendingStatus(noteId: number): string | null {
    const p = this.pendingByNoteId.get(noteId);
    if (!p?.key) return null;
    if (Date.now() - (p.at || 0) > 4000) return null;
    return p.key;
  }

  private clearPending(noteId: number): void {
    this.pendingByNoteId.delete(noteId);
    this.refreshStatus(noteId);
  }

  private pendingIs(noteId: number, key: string, withinMs: number): boolean {
    const p = this.pendingByNoteId.get(noteId);
    if (!p || p.key !== key) return false;
    return Date.now() - p.at <= withinMs;
  }

  private setPending(noteId: number, key: string): void {
    this.pendingByNoteId.set(noteId, { key, at: Date.now() });
    this.refreshStatus(noteId);
  }

  private getUndoStack(noteId: number): string[] {
    let stack = this.undoStackByNoteId.get(noteId);
    if (!stack) {
      stack = [];
      this.undoStackByNoteId.set(noteId, stack);
    }
    return stack;
  }

  private undoPush(noteId: number, html: string, { force } = { force: false }): void {
    const stack = this.getUndoStack(noteId);
    const value = typeof html === 'string' ? html : '';
    const last = stack.length ? stack[stack.length - 1] : null;
    if (!force && last === value) return;
    const meta = this.undoMetaByNoteId.get(noteId) || { lastPushAt: 0 };
    const now = Date.now();
    const withinCoalesce = !force && now - (meta.lastPushAt || 0) < 450;
    if (withinCoalesce && stack.length) stack[stack.length - 1] = value;
    else {
      stack.push(value);
      if (stack.length > 60) stack.splice(0, stack.length - 60);
    }
    this.undoMetaByNoteId.set(noteId, { lastPushAt: now });
  }

  private undoApply(editor: HTMLElement, noteId: number): boolean {
    const stack = this.getUndoStack(noteId);
    if (stack.length < 2) return false;
    stack.pop();
    const prev = stack[stack.length - 1];
    if (typeof prev !== 'string') return false;
    this.undoApplying.add(noteId);
    try {
      editor.innerHTML = prev;
      const sel = window.getSelection();
      if (sel) {
        const r = document.createRange();
        r.selectNodeContents(editor);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } finally {
      setTimeout(() => this.undoApplying.delete(noteId), 0);
    }
  }

  private getRegisterBank(noteId: number): Map<string, RegisterValue> {
    let bank = this.registersByNoteId.get(noteId);
    if (!bank) {
      bank = new Map();
      this.registersByNoteId.set(noteId, bank);
    }
    return bank;
  }

  private setRegister(noteId: number, name: string, value: RegisterValue): void {
    this.getRegisterBank(noteId).set(String(name || '0'), value);
  }

  private getRegister(noteId: number, name: string): RegisterValue | null {
    const v = this.getRegisterBank(noteId).get(String(name || '0'));
    return v ?? null;
  }

  private setNextRegister(noteId: number, name: string): void {
    this.nextRegisterByNoteId.set(noteId, String(name || '0'));
    this.refreshStatus(noteId);
  }

  private getOpRegisterName(noteId: number): string {
    const name = this.nextRegisterByNoteId.get(noteId);
    this.nextRegisterByNoteId.delete(noteId);
    this.refreshStatus(noteId);
    return name || '0';
  }

  private yankSelection(editor: HTMLElement, noteId: number, registerName: string) {
    const r = getSelectionRangeInEditor(editor);
    if (!r || r.collapsed) return { ok: false, clipboardOk: false };
    const { html, text } = yankFromRange(editor, r);
    this.setRegister(noteId, registerName, { html, text });
    const clipboardOk =
      registerName === '+' ? vimWriteClipboard({ text, html }, { editor }) : false;
    return { ok: true, clipboardOk };
  }

  private yankBlock(editor: HTMLElement, noteId: number, registerName: string) {
    const { html, text } = yankCurrentBlock(editor);
    this.setRegister(noteId, registerName, { html, text });
    const clipboardOk =
      registerName === '+' ? vimWriteClipboard({ text, html }, { editor }) : false;
    return { ok: true, clipboardOk };
  }
}
