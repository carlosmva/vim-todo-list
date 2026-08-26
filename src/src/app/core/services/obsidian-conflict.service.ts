import { ApplicationRef, Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AppStateService } from './app-state.service';
import { ObsidianConflict, ObsidianOpResult, ObsidianService } from './obsidian.service';
import { safeFocus } from '../keyboard/keyboard-focus.util';
import {
  conflictChoiceButtons,
  obsidianConflictKeyAction,
} from '../utils/obsidian-conflict-keys.util';

export interface ObsidianConflictResolved {
  noteId: number;
  afterResolve: 'editor' | 'obsidian';
  choice: 'app' | 'vault';
  result: ObsidianOpResult;
}

/** Global Obsidian merge modal state (rendered at app root to avoid overflow clipping). */
@Injectable({ providedIn: 'root' })
export class ObsidianConflictService {
  private readonly obsidian = inject(ObsidianService);
  private readonly appRef = inject(ApplicationRef);
  private readonly state = inject(AppStateService);
  private keysAttached = false;

  readonly conflict = signal<ObsidianConflict | null>(null);
  readonly resolved = new Subject<ObsidianConflictResolved>();

  /** Capture-phase listener, registered before vim/global nav so 1/2/Esc actually reach the modal. */
  attachKeys(): void {
    if (this.keysAttached || typeof document === 'undefined') return;
    this.keysAttached = true;
    document.addEventListener('keydown', this.onDocumentKeydown, true);
  }

  present(conflict: ObsidianConflict, afterResolve: 'editor' | 'obsidian'): void {
    this.conflict.set({ ...conflict, afterResolve });
    this.appRef.tick();
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const modal = document.getElementById('obsidianConflictModal');
        const useApp = document.getElementById('obsidianConflictUseApp');
        if (modal instanceof HTMLElement) modal.scrollIntoView({ block: 'nearest' });
        if (useApp instanceof HTMLElement) safeFocus(useApp);
      });
    });
  }

  close(): void {
    this.conflict.set(null);
  }

  async resolve(choice: 'app' | 'vault'): Promise<void> {
    const conflict = this.conflict();
    if (!conflict || !conflict.afterResolve) return;
    const afterResolve = conflict.afterResolve;
    const noteId = conflict.noteId;
    const result = await this.obsidian.resolveConflict(conflict, choice);
    this.conflict.set(null);
    this.resolved.next({ noteId, afterResolve, choice, result });
  }

  private onDocumentKeydown = (event: KeyboardEvent): void => {
    if (!this.conflict()) return;
    const action = obsidianConflictKeyAction(event, this.state.keyLayout(), this.state.keyboardNavPlatform());
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const buttons = conflictChoiceButtons();
    if (action.type === 'cancel') {
      this.close();
      return;
    }
    if (action.type === 'resolve') {
      void this.resolve(action.choice);
      return;
    }
    if (action.type === 'activate') {
      const active = document.activeElement;
      if (active instanceof HTMLElement && buttons.includes(active)) {
        active.click();
        return;
      }
      void this.resolve('app');
      return;
    }
    if (action.type === 'cycle') {
      this.cycleFocus(buttons, action.delta);
      return;
    }
    this.moveFocus(buttons, action.direction);
  };

  private cycleFocus(buttons: HTMLElement[], delta: 1 | -1): void {
    if (!buttons.length) return;
    const active = document.activeElement;
    let idx = active instanceof HTMLElement ? buttons.indexOf(active) : -1;
    if (idx < 0) idx = delta === 1 ? -1 : 0;
    const next = buttons[(idx + delta + buttons.length) % buttons.length];
    safeFocus(next);
  }

  private moveFocus(buttons: HTMLElement[], direction: 'left' | 'right' | 'up' | 'down'): void {
    const [useApp, useVault] = buttons;
    if (direction === 'left' && useApp) {
      safeFocus(useApp);
      return;
    }
    if (direction === 'right' && useVault) {
      safeFocus(useVault);
      return;
    }
    this.cycleFocus(buttons, direction === 'down' || direction === 'right' ? 1 : -1);
  }
}
