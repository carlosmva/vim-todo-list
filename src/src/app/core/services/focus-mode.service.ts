import { Injectable, signal } from '@angular/core';
import type { Note } from '../models/note.model';
import { safeFocus } from '../keyboard/keyboard-focus.util';
import {
  cycleFocusModeButtons,
  focusModeKeyAction,
  focusTodayProgress,
  formatElapsed,
  type FocusTodayProgress,
} from '../utils/focus-mode.util';

export interface FocusModeHandlers {
  complete(note: Note): Promise<void>;
  openNotes(note: Note): Promise<void>;
  onClosed(noteId: number | null): void;
}

@Injectable({ providedIn: 'root' })
export class FocusModeService {
  readonly active = signal(false);
  readonly note = signal<Note | null>(null);
  readonly cleared = signal(false);
  readonly completing = signal(false);
  readonly elapsedLabel = signal('0:00');
  readonly progress = signal<FocusTodayProgress>({
    done: 0,
    remaining: 0,
    total: 0,
    usesDueToday: false,
  });

  private keysAttached = false;
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private handlers: FocusModeHandlers | null = null;
  private closedNoteId: number | null = null;

  register(handlers: FocusModeHandlers): void {
    this.handlers = handlers;
  }

  unregister(): void {
    this.handlers = null;
  }

  attachKeys(): void {
    if (this.keysAttached || typeof document === 'undefined') return;
    this.keysAttached = true;
    document.addEventListener('keydown', this.onDocumentKeydown, true);
  }

  start(note: Note, boardNotes: Note[]): boolean {
    if (note.status !== 'pending') return false;
    this.closedNoteId = note.id;
    this.note.set(note);
    this.cleared.set(false);
    this.completing.set(false);
    this.refreshProgress(boardNotes);
    this.startedAt = Date.now();
    this.elapsedLabel.set('0:00');
    this.active.set(true);
    this.startTimer();
    this.focusPrimaryButton();
    return true;
  }

  close(options: { restoreFocus?: boolean } = {}): void {
    if (!this.active()) return;
    const restoreFocus = options.restoreFocus !== false;
    const noteId = this.closedNoteId;
    this.active.set(false);
    this.stopTimer();
    this.note.set(null);
    this.cleared.set(false);
    this.completing.set(false);

    if (restoreFocus) this.handlers?.onClosed(noteId);
    this.closedNoteId = null;
  }

  completeCurrent(): void {
    const note = this.note();
    if (!note || this.completing() || this.cleared() || !this.handlers) return;
    this.completing.set(true);
    void this.handlers.complete(note);
  }

  openNotesCurrent(): void {
    const note = this.note();
    if (!note || this.completing() || this.cleared()) return;
    void this.handlers?.openNotes(note);
  }

  releaseCompleting(): void {
    this.completing.set(false);
  }

  afterComplete(boardNotes: Note[], next: Note | null): void {
    this.completing.set(false);
    this.refreshProgress(boardNotes);
    if (next) {
      this.closedNoteId = next.id;
      this.note.set(next);
      this.cleared.set(false);
      this.focusPrimaryButton();
      return;
    }
    this.note.set(null);
    this.cleared.set(true);
    this.focusPrimaryButton();
  }

  private refreshProgress(boardNotes: Note[]): void {
    this.progress.set(focusTodayProgress(boardNotes, Date.now()));
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = window.setInterval(() => {
      this.elapsedLabel.set(formatElapsed(Date.now() - this.startedAt));
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private focusPrimaryButton(): void {
    window.setTimeout(() => {
      if (!this.active()) return;
      const id = this.cleared() ? 'focusModeDismiss' : 'focusModeComplete';
      safeFocus(document.getElementById(id));
    }, 0);
  }

  private buttons(): HTMLButtonElement[] {
    return [
      document.getElementById('focusModeComplete'),
      document.getElementById('focusModeNotes'),
      document.getElementById('focusModeDismiss'),
    ].filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement && !el.disabled);
  }

  private onDocumentKeydown = (event: KeyboardEvent): void => {
    if (!this.active()) return;
    const action = focusModeKeyAction(event);
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (action.type === 'close') {
      this.close({ restoreFocus: true });
      return;
    }

    if (this.cleared()) {
      if (action.type === 'activate' || action.type === 'complete' || action.type === 'notes') {
        this.close({ restoreFocus: true });
      }
      return;
    }

    if (this.completing()) return;

    if (action.type === 'complete') {
      this.completeCurrent();
      return;
    }
    if (action.type === 'notes') {
      this.openNotesCurrent();
      return;
    }
    if (action.type === 'activate') {
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && this.buttons().includes(active) && !active.disabled) {
        active.click();
        return;
      }
      document.getElementById('focusModeComplete')?.click();
      return;
    }

    const next = cycleFocusModeButtons(this.buttons(), action.delta);
    if (next) safeFocus(next);
  };
}
