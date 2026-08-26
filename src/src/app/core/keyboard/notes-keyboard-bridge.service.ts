import { Injectable } from '@angular/core';

export interface NotesKeyboardHandlers {
  boards(): string[];
  activeBoard(): string;
  setBoard(name: string): void;
  openAddDialog(): void;
  closeAddDialog(): boolean;
  isAddDialogOpen(): boolean;
  cycleAddDialogFocus(delta: 1 | -1): boolean;
  moveAddDialogFocus(direction: 'left' | 'right' | 'up' | 'down'): boolean;
  closeDeleteDialog(): boolean;
  isDeleteDialogOpen(): boolean;
  confirmDeleteDialog(): boolean;
  cycleDeleteDialogFocus(delta: 1 | -1): boolean;
  moveDeleteDialogFocus(direction: 'left' | 'right' | 'up' | 'down'): boolean;
  closeFlippedOrEditor(options?: { save?: boolean }): boolean;
  closeCardOverlays(card: HTMLElement): void;
  closeEditor(noteId: number, options?: { save?: boolean }): void;
  saveEditorHtml(noteId: number): Promise<void>;
  hasOpenEditor(): boolean;
  openEditorIds?(): number[];
  isEditorOpen?(noteId: number): boolean;
  focusFilter(): void;
  setBoardColumnSplit(which: 'pending' | 'complete'): void;
  renameFocusedCard?(): void;
  loadMoreAfter?(noteId: number): boolean;
  loadMoreBefore?(noteId: number): boolean;
}

@Injectable({ providedIn: 'root' })
export class NotesKeyboardBridge {
  private handlers: NotesKeyboardHandlers | null = null;
  lastBoardShortcutAt = 0;

  register(handlers: NotesKeyboardHandlers): void {
    this.handlers = handlers;
  }

  unregister(): void {
    this.handlers = null;
  }

  get(): NotesKeyboardHandlers | null {
    return this.handlers;
  }
}
