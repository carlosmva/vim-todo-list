import { Component, OnDestroy, OnInit, ChangeDetectorRef, Injector, afterNextRender, inject, signal, type WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { MarkdownComponent } from 'ngx-markdown';
import { AppStateService } from '../../core/services/app-state.service';
import { DatabaseService } from '../../core/services/database.service';
import { ObsidianService, type ObsidianOpResult } from '../../core/services/obsidian.service';
import { ObsidianConflictService } from '../../core/services/obsidian-conflict.service';
import { AutocompleteService } from '../../core/services/autocomplete.service';
import { filterNotes, NotesRepository } from '../../core/services/notes.repository';
import { PriorityRibbonService } from '../../core/services/priority-ribbon.service';
import { Note, formatDueDate, formatPriorityLabel, nextPriority } from '../../core/models/note.model';
import { NotesKeyboardBridge } from '../../core/keyboard/notes-keyboard-bridge.service';
import { NotesVimEditorService } from '../../core/keyboard/notes-vim-editor.service';
import { focusCardPrimaryAction, getCardFromElement, safeFocus } from '../../core/keyboard/keyboard-focus.util';
import { addCalendarMonthsClamped, dateToDateInputValue } from '../../core/utils/date.util';
import {
  applyMarkdownToEditor,
  editorContentToMarkdown,
  hasNotesPreviewContent,
  notesContentForEditorSeed,
  notesContentToPreviewMarkdown,
} from '../../core/utils/notes-html.util';
import { morphCardHeightByNoteId } from '../../core/utils/card-height.util';
import { boardSlideDirection } from '../../core/utils/board-slide.util';
import { focusPendingQueue, nextFocusNote } from '../../core/utils/focus-mode.util';
import { FocusModeService } from '../../core/services/focus-mode.service';
import { normalizeUrl } from '../../core/utils/url.util';
import {
  CompletionCandidate,
  completionPreview,
  getLastToken,
} from '../../core/utils/autocomplete.util';

interface LinkDraft {
  description: string;
  url: string;
}

@Component({
  selector: 'app-notes',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownComponent],
  templateUrl: './notes.component.html',
  styleUrl: './notes.component.scss',
})
export class NotesComponent implements OnInit, OnDestroy {
  private static readonly NOTES_PAGE_SIZE = 24;
  private static readonly NOTES_WINDOW_MAX = 72;
  private static readonly COMPLETE_ANIMATION_MS = 320;
  private static readonly DELETE_ANIMATION_MS = 680;
  private static readonly BOARD_SLIDE_LEAVE_MS = 70;
  private static readonly BOARD_SLIDE_ENTER_MS = 80;
  readonly state = inject(AppStateService);
  private readonly repo = inject(NotesRepository);
  private readonly ribbon = inject(PriorityRibbonService);
  private readonly dbService = inject(DatabaseService);
  private readonly obsidian = inject(ObsidianService);
  private readonly obsidianConflict = inject(ObsidianConflictService);
  private readonly autocomplete = inject(AutocompleteService);
  private readonly keyboardBridge = inject(NotesKeyboardBridge);
  private readonly vimEditor = inject(NotesVimEditorService);
  private readonly focusMode = inject(FocusModeService);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);

  boards = signal<string[]>([]);
  notes = signal<Note[]>([]);
  pendingCountsByBoard = signal<Map<string, number>>(new Map());
  readonly pendingWindowStart = signal(0);
  readonly pendingWindowEnd = signal(NotesComponent.NOTES_PAGE_SIZE);
  readonly completeWindowStart = signal(0);
  readonly completeWindowEnd = signal(NotesComponent.NOTES_PAGE_SIZE);
  filterQuery = signal('');
  addDialogVisible = signal(false);
  deleteDialogVisible = signal(false);
  deleteTarget = signal<Note | null>(null);
  dueQuickVisible = signal(false);
  editingDueNoteId = signal<number | null>(null);
  readonly boardSplit = signal<'pending' | 'complete'>('pending');
  newNoteText = '';
  taskLocalSuggestions = signal<string[]>([]);
  taskLocalCompletion = signal<CompletionCandidate | null>(null);
  taskAiCompletion = signal<CompletionCandidate | null>(null);
  taskAiPending = signal(false);
  taskAiError = signal('');
  editorLocalSuggestions = signal<string[]>([]);
  editorLocalCompletion = signal<CompletionCandidate | null>(null);
  editorAiCompletion = signal<{ noteId: number; candidate: CompletionCandidate } | null>(null);
  editorAiPending = signal(false);
  editorAiError = signal('');
  obsidianMessage = signal('');
  obsidianMessageKind = signal<'error' | 'warning' | ''>('');
  completingNoteIds = signal<number[]>([]);
  deletingNoteIds = signal<number[]>([]);
  completeRailPulse = signal(0);
  draggedNoteId = signal<number | null>(null);
  dragHoverBoard = signal('');
  reorderTargetNoteId = signal<number | null>(null);
  reorderTargetEdge = signal<'before' | 'after' | null>(null);
  movingNoteIds = signal<number[]>([]);
  boardTransferPulse = signal('');
  readonly boardSlide = signal('');
  private boardSlideGen = 0;
  private taskLocalTimer: ReturnType<typeof setTimeout> | null = null;
  private taskAiTimer: ReturnType<typeof setTimeout> | null = null;
  private taskAiAbort: AbortController | null = null;
  private editorLocalTimer: ReturnType<typeof setTimeout> | null = null;
  private editorAiTimer: ReturnType<typeof setTimeout> | null = null;
  private editorAiAbort: AbortController | null = null;
  private editorAiNoteId = 0;
  newNoteDue = '';
  dueEditValue = '';
  private clearSearchOnSubmit = false;
  private deleteReturnFocusNoteId: number | null = null;
  private readonly linkDraftByNoteId = new Map<number, LinkDraft>();
  private conflictResolvedSub?: Subscription;

  ngOnInit(): void {
    this.refresh();
    afterNextRender(() => this.focusFilter(), { injector: this.injector });
    this.focusCalendarSelection();
    this.keyboardBridge.register({
      boards: () => this.boards(),
      activeBoard: () => this.state.activeBoard(),
      setBoard: (name) => this.setBoard(name),
      openAddDialog: () => this.openAddDialog(),
      closeAddDialog: () => {
        if (!this.addDialogVisible()) return false;
        this.closeAddDialog();
        return true;
      },
      isAddDialogOpen: () => this.addDialogVisible(),
      cycleAddDialogFocus: (delta) => this.cycleAddDialogFocus(delta),
      moveAddDialogFocus: (direction) => this.moveAddDialogFocus(direction),
      closeDeleteDialog: () => {
        if (!this.deleteDialogVisible()) return false;
        this.closeDeleteDialog();
        return true;
      },
      isDeleteDialogOpen: () => this.deleteDialogVisible(),
      confirmDeleteDialog: () => {
        if (!this.deleteDialogVisible()) return false;
        void this.confirmDeleteDialog();
        return true;
      },
      cycleDeleteDialogFocus: (delta) => this.cycleDeleteDialogFocus(delta),
      moveDeleteDialogFocus: (direction) => this.moveDeleteDialogFocus(direction),
      closeFlippedOrEditor: (options) => this.closeFlippedOrEditor(options),
      closeCardOverlays: (card) => this.closeCardOverlays(card),
      closeEditor: (noteId, options) => this.closeEditor(noteId, options),
      saveEditorHtml: (noteId) => this.saveEditorHtml(noteId),
      hasOpenEditor: () => this.openEditors.size > 0,
      openEditorIds: () => [...this.openEditors],
      isEditorOpen: (noteId) => this.openEditors.has(noteId),
      focusFilter: () => this.focusFilter(),
      setBoardColumnSplit: (which) => this.setBoardColumnSplit(which),
      renameFocusedCard: () => this.renameFocusedCard(),
      loadMoreAfter: (noteId) => this.loadMoreAfter(noteId),
      loadMoreBefore: (noteId) => this.loadMoreBefore(noteId),
      focusExtremeCard: (which) => this.focusExtremeCard(which),
      openFocusMode: (noteId) => this.openFocusMode(noteId),
    });
    this.focusMode.register({
      complete: (note) => this.completeFromFocus(note),
      openNotes: (note) => this.openNotesFromFocus(note),
      onClosed: (noteId) => this.restoreFocusFromFocus(noteId),
    });
    this.conflictResolvedSub = this.obsidianConflict.resolved.subscribe(({ noteId, afterResolve, choice, result }) => {
      this.refresh();
      if (result.kind === 'error') {
        this.applyObsidianResult(result);
        return;
      }
      if (result.kind === 'ok' && result.warning) this.applyObsidianResult(result);
      const note = this.repo.queryNote(noteId);
      if (!note) return;
      if (afterResolve === 'editor') {
        this.openEditors.add(note.id);
        this.cdr.detectChanges();
        afterNextRender(() => this.scheduleNotesEditorFocus(note.id), { injector: this.injector });
        return;
      }
      if (afterResolve === 'obsidian') {
        void this.obsidian.navigateToNote(note.id, { skipVaultWrite: choice === 'vault' }).then((nav) => {
          this.applyObsidianResult(nav);
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.boardSlideGen += 1;
    this.focusMode.close({ restoreFocus: false });
    this.focusMode.unregister();
    this.conflictResolvedSub?.unsubscribe();
    this.keyboardBridge.unregister();
    this.clearTaskAutocomplete();
    this.clearEditorAutocomplete();
  }

  focusFilter(): void {
    const el = document.getElementById('cardFilterInput');
    if (el instanceof HTMLInputElement) {
      safeFocus(el);
      el.select();
    }
  }

  private focusCalendarSelection(): void {
    const noteId = Number(this.route.snapshot.queryParamMap.get('noteId'));
    if (!Number.isFinite(noteId)) return;
    const pendingIndex = this.pendingNotes().findIndex((note) => note.id === noteId);
    if (pendingIndex < 0) return;

    this.ensureNoteInWindow('pending', pendingIndex);
    this.focusNotesToggle(noteId);
  }

  closeEditor(noteId: number, options?: { save?: boolean }): void {
    if (!this.openEditors.has(noteId)) return;
    const finish = () => {
      this.openEditors.delete(noteId);
      this.refresh();
      this.cdr.detectChanges();
      this.focusNotesToggle(noteId);
    };
    if (options?.save) {
      void this.saveEditorHtml(noteId).then(finish);
      return;
    }
    finish();
  }

  closeFlippedOrEditor(options?: { save?: boolean }): boolean {
    const active = document.activeElement;
    const card = getCardFromElement(active);
    if (card?.classList.contains('is-flipped')) {
      const id = Number(card.dataset['noteId']);
      if (Number.isFinite(id)) this.unflipNote(id);
      return true;
    }
    if (this.openEditors.size) {
      const id = card ? Number(card.dataset['noteId']) : [...this.openEditors][0];
      if (Number.isFinite(id)) {
        this.closeEditor(id, options);
        return true;
      }
    }
    return false;
  }

  closeCardOverlays(card: HTMLElement): void {
    const noteId = Number(card.dataset['noteId']);
    if (!Number.isFinite(noteId)) return;
    if (this.openEditors.has(noteId)) {
      this.openEditors.delete(noteId);
    }
    if (this.flipped.has(noteId)) {
      this.unflipNote(noteId, { focusLinksButton: false });
    }
  }

  private unflipNote(noteId: number, options?: { focusLinksButton?: boolean }): void {
    this.flipped.delete(noteId);
    this.cdr.detectChanges();
    afterNextRender(() => {
      morphCardHeightByNoteId(noteId);
      if (options?.focusLinksButton !== false) this.focusLinksButton(noteId);
    }, { injector: this.injector });
  }

  async saveEditorHtml(noteId: number, opts: { skipVaultPush?: boolean } = {}): Promise<void> {
    const editor = document.querySelector(
      `.noteEditorArea[data-note-id="${CSS.escape(String(noteId))}"]`
    );
    if (!(editor instanceof HTMLElement)) return;
    this.repo.updateNotesHtml(noteId, editorContentToMarkdown(editor));
    await this.dbService.persist();
    if (!opts.skipVaultPush) await this.obsidian.pushNoteById(noteId);
  }

  private focusNotesToggle(noteId: number): void {
    afterNextRender(() => {
      const card = document.querySelector(
        `.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`
      );
      if (!(card instanceof HTMLElement)) return;
      const notesBtn = [...card.querySelectorAll<HTMLElement>('button')].find((b) =>
        /notes/i.test(b.textContent || '')
      );
      if (notesBtn) safeFocus(notesBtn);
    }, { injector: this.injector });
  }

  renameFocusedCard(): void {
    const card = getCardFromElement(document.activeElement);
    if (!card) return;
    const noteId = Number(card.dataset['noteId']);
    if (!Number.isFinite(noteId)) return;
    const note = this.notes().find((n) => n.id === noteId);
    if (!note) return;
    const body = card.querySelector('.noteFace:not(.noteBack) .noteText');
    if (!(body instanceof HTMLElement) || card.querySelector('.noteTextRenameInput')) return;
    const current = (body.textContent || '').trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'noteTextRenameInput bx--text-input';
    input.value = current;
    input.setAttribute('aria-label', 'Rename task');
    const finish = (save: boolean) => {
      input.remove();
      body.hidden = false;
      const text = input.value.trim();
      if (save && text) {
        this.repo.updateNoteText(noteId, text);
        void this.dbService.persist().then(() => this.refresh());
      } else {
        body.textContent = current;
      }
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        finish(true);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    body.hidden = true;
    body.parentNode?.insertBefore(input, body);
    input.focus();
    input.select();
  }

  refresh(): void {
    this.pendingCountsByBoard.set(this.repo.queryPendingCountsByBoard());
    this.ribbon.refreshItems();
    if (this.openEditors.size > 0) return;
    this.boards.set(this.repo.queryBoards());
    const board = this.state.activeBoard();
    const raw = this.filterQuery().trim()
      ? this.repo.queryAllNotes()
      : this.repo.queryNotes(board);
    this.notes.set(filterNotes(raw, this.filterQuery()));
    this.resetListWindow('pending');
    this.resetListWindow('complete');
  }

  pendingNotes(): Note[] {
    return this.notes().filter((n) => n.status === 'pending');
  }

  completeNotes(): Note[] {
    return this.notes().filter((n) => n.status === 'complete');
  }

  visiblePendingNotes(): Note[] {
    return this.pendingNotes().slice(this.pendingWindowStart(), this.pendingWindowEnd());
  }

  visibleCompleteNotes(): Note[] {
    return this.completeNotes().slice(this.completeWindowStart(), this.completeWindowEnd());
  }

  hasMorePending(): boolean {
    return this.pendingWindowEnd() < this.pendingNotes().length;
  }

  hasMoreComplete(): boolean {
    return this.completeWindowEnd() < this.completeNotes().length;
  }

  hasMorePendingBefore(): boolean {
    return this.pendingWindowStart() > 0;
  }

  hasMoreCompleteBefore(): boolean {
    return this.completeWindowStart() > 0;
  }

  onListScroll(status: 'pending' | 'complete', event: Event): void {
    const list = event.currentTarget;
    if (!(list instanceof HTMLElement)) return;
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (remaining <= 120) this.loadMore(status, 'after', list);
    if (list.scrollTop <= 120) this.loadMore(status, 'before', list);
  }

  private resetListWindow(status: 'pending' | 'complete'): void {
    const total = status === 'pending' ? this.pendingNotes().length : this.completeNotes().length;
    const end = Math.min(NotesComponent.NOTES_PAGE_SIZE, total);
    if (status === 'pending') {
      this.pendingWindowStart.set(0);
      this.pendingWindowEnd.set(end);
      return;
    }
    this.completeWindowStart.set(0);
    this.completeWindowEnd.set(end);
  }

  private listWindow(status: 'pending' | 'complete'): {
    start: WritableSignal<number>;
    end: WritableSignal<number>;
  } {
    return status === 'pending'
      ? { start: this.pendingWindowStart, end: this.pendingWindowEnd }
      : { start: this.completeWindowStart, end: this.completeWindowEnd };
  }

  private listElementId(status: 'pending' | 'complete'): string {
    return status === 'pending' ? 'pendingList' : 'completeList';
  }

  private columnElementId(status: 'pending' | 'complete'): string {
    return status === 'pending' ? 'colPending' : 'colComplete';
  }

  private columnScrollElement(status: 'pending' | 'complete'): HTMLElement | null {
    return document.getElementById(this.columnElementId(status));
  }

  private applyScrollHeightDelta(
    scrollContainer: HTMLElement,
    scrollTopBefore: number,
    scrollHeightBefore: number
  ): void {
    afterNextRender(() => {
      scrollContainer.scrollTop = scrollTopBefore + (scrollContainer.scrollHeight - scrollHeightBefore);
    }, { injector: this.injector });
  }

  private ensureNoteInWindow(status: 'pending' | 'complete', noteIndex: number): void {
    const notes = status === 'pending' ? this.pendingNotes() : this.completeNotes();
    const total = notes.length;
    if (noteIndex < 0 || noteIndex >= total) return;

    const { start, end } = this.listWindow(status);
    if (noteIndex >= start() && noteIndex < end()) return;

    if (noteIndex < start()) {
      const nextStart = Math.max(0, noteIndex);
      start.set(nextStart);
      end.set(Math.min(total, Math.max(end(), nextStart + NotesComponent.NOTES_PAGE_SIZE)));
      return;
    }

    end.set(noteIndex + 1);
    start.set(Math.max(0, Math.min(start(), end() - NotesComponent.NOTES_PAGE_SIZE)));
  }

  private loadMore(
    status: 'pending' | 'complete',
    direction: 'before' | 'after',
    scrollEl?: HTMLElement | null
  ): boolean {
    const notes = status === 'pending' ? this.pendingNotes() : this.completeNotes();
    const total = notes.length;
    const { start, end } = this.listWindow(status);
    const scrollContainer = scrollEl ?? this.columnScrollElement(status);

    if (direction === 'after') {
      if (end() >= total) return false;

      const scrollTopBefore = scrollContainer instanceof HTMLElement ? scrollContainer.scrollTop : 0;
      const scrollHeightBefore = scrollContainer instanceof HTMLElement ? scrollContainer.scrollHeight : 0;
      const oldStart = start();

      end.set(Math.min(total, end() + NotesComponent.NOTES_PAGE_SIZE));
      if (end() - start() > NotesComponent.NOTES_WINDOW_MAX) {
        start.set(end() - NotesComponent.NOTES_WINDOW_MAX);
      }

      const trimmed = start() - oldStart;
      if (trimmed > 0 && scrollContainer instanceof HTMLElement) {
        this.cdr.detectChanges();
        this.applyScrollHeightDelta(scrollContainer, scrollTopBefore, scrollHeightBefore);
      } else {
        this.cdr.markForCheck();
      }
      return true;
    }

    if (start() <= 0) return false;

    const scrollTopBefore = scrollContainer instanceof HTMLElement ? scrollContainer.scrollTop : 0;
    const scrollHeightBefore = scrollContainer instanceof HTMLElement ? scrollContainer.scrollHeight : 0;

    start.set(Math.max(0, start() - NotesComponent.NOTES_PAGE_SIZE));

    if (!(scrollContainer instanceof HTMLElement)) {
      this.cdr.markForCheck();
      return true;
    }

    this.cdr.detectChanges();
    this.applyScrollHeightDelta(scrollContainer, scrollTopBefore, scrollHeightBefore);
    return true;
  }

  private loadMoreAfter(noteId: number): boolean {
    const note = this.notes().find((item) => item.id === noteId);
    if (!note) return false;
    const status = note.status;
    const notes = status === 'pending' ? this.pendingNotes() : this.completeNotes();
    const index = notes.findIndex((item) => item.id === noteId);
    const nextId = notes[index + 1]?.id;
    if (index < 0 || !nextId) return false;

    const { end } = this.listWindow(status);
    if (index !== end() - 1) return false;

    const list = document.getElementById(this.listElementId(status));
    const column = this.columnScrollElement(status);
    if (!this.loadMore(status, 'after', column)) return false;

    this.cdr.detectChanges();
    afterNextRender(() => {
      const nextCard = list
        ?.querySelector<HTMLElement>(`.noteCard[data-note-id="${CSS.escape(String(nextId))}"]`);
      if (nextCard) focusCardPrimaryAction(nextCard);
    }, { injector: this.injector });
    return true;
  }

  private loadMoreBefore(noteId: number): boolean {
    const note = this.notes().find((item) => item.id === noteId);
    if (!note) return false;
    const status = note.status;
    const notes = status === 'pending' ? this.pendingNotes() : this.completeNotes();
    const index = notes.findIndex((item) => item.id === noteId);
    const prevId = notes[index - 1]?.id;
    if (index <= 0 || !prevId) return false;

    const { start } = this.listWindow(status);
    if (index !== start()) return false;

    const list = document.getElementById(this.listElementId(status));
    const column = this.columnScrollElement(status);
    if (!this.loadMore(status, 'before', column)) return false;

    this.cdr.detectChanges();
    afterNextRender(() => {
      const prevCard = list
        ?.querySelector<HTMLElement>(`.noteCard[data-note-id="${CSS.escape(String(prevId))}"]`);
      if (prevCard) focusCardPrimaryAction(prevCard);
    }, { injector: this.injector });
    return true;
  }

  private columnStatusFromFocus(): 'pending' | 'complete' {
    const active = document.activeElement;
    const card = getCardFromElement(active);
    const el = card ?? (active instanceof Element ? active : null);
    if (el?.closest('#colComplete, #completeList')) return 'complete';
    if (el?.closest('#colPending, #pendingList')) return 'pending';
    return this.boardSplit();
  }

  openFocusMode(noteId: number): boolean {
    const note = this.notes().find((n) => n.id === noteId) ?? this.repo.queryNote(noteId);
    if (!note || note.status !== 'pending') return false;
    return this.focusMode.start(note, this.repo.queryNotes(note.board));
  }

  private restoreFocusFromFocus(noteId: number | null): void {
    if (!noteId) {
      safeFocus(document.getElementById('addNoteButton'));
      return;
    }
    const pendingIndex = this.pendingNotes().findIndex((n) => n.id === noteId);
    if (pendingIndex >= 0) {
      this.ensureNoteInWindow('pending', pendingIndex);
      afterNextRender(() => {
        const card = document.querySelector<HTMLElement>(`.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`);
        if (card) focusCardPrimaryAction(card);
        else safeFocus(document.getElementById('addNoteButton'));
      }, { injector: this.injector });
      return;
    }
    const completeIndex = this.completeNotes().findIndex((n) => n.id === noteId);
    if (completeIndex >= 0) {
      this.ensureNoteInWindow('complete', completeIndex);
      this.setBoardColumnSplit('complete');
      afterNextRender(() => {
        const card = document.querySelector<HTMLElement>(`.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`);
        if (card) focusCardPrimaryAction(card);
        else safeFocus(document.getElementById('colComplete'));
      }, { injector: this.injector });
      return;
    }
    safeFocus(document.getElementById('addNoteButton'));
  }

  private async completeFromFocus(note: Note): Promise<void> {
    try {
      await this.persistCompletion(note);
      const boardNotes = this.repo.queryNotes(note.board);
      const queue = focusPendingQueue(boardNotes, Date.now());
      const next = nextFocusNote(queue, note.id);
      this.focusMode.afterComplete(boardNotes, next);
    } catch {
      this.focusMode.releaseCompleting();
    }
  }

  private async openNotesFromFocus(note: Note): Promise<void> {
    this.focusMode.close({ restoreFocus: false });
    const pendingIndex = this.pendingNotes().findIndex((n) => n.id === note.id);
    if (pendingIndex >= 0) this.ensureNoteInWindow('pending', pendingIndex);
    const live = this.notes().find((n) => n.id === note.id) ?? this.repo.queryNote(note.id);
    if (!live) return;
    await this.toggleEditor(live);
  }

  private focusExtremeCard(which: 'first' | 'last'): boolean {
    const status = this.columnStatusFromFocus();
    const notes = status === 'pending' ? this.pendingNotes() : this.completeNotes();
    if (!notes.length) return false;

    const target = which === 'first' ? notes[0] : notes[notes.length - 1];
    const page = NotesComponent.NOTES_PAGE_SIZE;
    const { start, end } = this.listWindow(status);
    if (which === 'first') {
      start.set(0);
      end.set(Math.min(page, notes.length));
    } else {
      end.set(notes.length);
      start.set(Math.max(0, notes.length - page));
    }

    if (this.boardSplit() !== status) this.boardSplit.set(status);
    this.closeCardOverlaysForJump();
    this.cdr.detectChanges();
    afterNextRender(() => {
      const card = document.querySelector<HTMLElement>(
        `.noteCard[data-note-id="${CSS.escape(String(target.id))}"]`
      );
      if (card) focusCardPrimaryAction(card);
    }, { injector: this.injector });
    return true;
  }

  private closeCardOverlaysForJump(): void {
    const current = getCardFromElement(document.activeElement);
    if (current) this.closeCardOverlays(current);
  }

  setBoard(board: string): void {
    void this.slideToBoard(board);
  }

  private async slideToBoard(board: string): Promise<void> {
    const current = this.state.activeBoard();
    if (board === current) return;

    const dir = boardSlideDirection(this.boards().indexOf(current), this.boards().indexOf(board));
    const gen = ++this.boardSlideGen;

    if (!dir || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.state.setActiveBoard(board);
      this.refresh();
      this.boardSlide.set('');
      return;
    }

    this.boardSlide.set(`leave-${dir}`);
    this.cdr.markForCheck();
    await this.wait(NotesComponent.BOARD_SLIDE_LEAVE_MS);
    if (gen !== this.boardSlideGen) return;

    this.state.setActiveBoard(board);
    this.refresh();
    this.boardSlide.set(dir === 'left' ? 'enter-from-right' : 'enter-from-left');
    this.cdr.detectChanges();
    await this.wait(NotesComponent.BOARD_SLIDE_ENTER_MS);
    if (gen !== this.boardSlideGen) return;
    this.boardSlide.set('');
  }

  setBoardColumnSplit(which: 'pending' | 'complete'): void {
    const next = which === 'complete' ? 'complete' : 'pending';
    this.boardSplit.set(next);
    afterNextRender(() => this.focusBoardColumn(next), { injector: this.injector });
  }

  onBoardClick(event: MouseEvent): void {
    const board = event.currentTarget;
    if (!(board instanceof HTMLElement)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const col = target.closest('.col');
    if (!(col instanceof HTMLElement) || !board.contains(col)) return;

    const colPending = document.getElementById('colPending');
    const colComplete = document.getElementById('colComplete');
    if (!(colPending instanceof HTMLElement) || !(colComplete instanceof HTMLElement)) return;

    if (this.boardSplit() === 'pending' && col === colComplete) {
      event.preventDefault();
      this.setBoardColumnSplit('complete');
      return;
    }
    if (this.boardSplit() === 'complete' && col === colPending) {
      event.preventDefault();
      this.setBoardColumnSplit('pending');
    }
  }

  onBoardColumnKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const colPending = document.getElementById('colPending');
    const colComplete = document.getElementById('colComplete');
    const active = document.activeElement;
    if (active !== colPending && active !== colComplete) return;

    if (this.boardSplit() === 'pending' && active === colComplete) {
      event.preventDefault();
      this.setBoardColumnSplit('complete');
      return;
    }
    if (this.boardSplit() === 'complete' && active === colPending) {
      event.preventDefault();
      this.setBoardColumnSplit('pending');
    }
  }

  private focusBoardColumn(which: 'pending' | 'complete'): void {
    const col = document.getElementById(which === 'complete' ? 'colComplete' : 'colPending');
    if (col instanceof HTMLElement) safeFocus(col);
  }

  pendingCountForBoard(board: string): number {
    return this.pendingCountsByBoard().get(board) ?? 0;
  }

  boardTabAriaLabel(board: string): string {
    const count = this.pendingCountForBoard(board);
    return `${board}, ${count} pending task${count === 1 ? '' : 's'}`;
  }

  openAddDialog(prefill = ''): void {
    this.clearTaskAutocomplete();
    this.newNoteText = prefill;
    this.newNoteDue = '';
    this.dueQuickVisible.set(false);
    this.addDialogVisible.set(true);
    afterNextRender(() => {
      this.scheduleAddDialogFocus();
      if (prefill.trim()) this.scheduleTaskAutocomplete(prefill);
    }, { injector: this.injector });
  }

  private scheduleAddDialogFocus(attempt = 0): void {
    const maxAttempts = 12;
    requestAnimationFrame(() => {
      const noteText = document.getElementById('noteText');
      if (noteText instanceof HTMLInputElement) {
        safeFocus(noteText);
        try {
          const len = noteText.value.length;
          noteText.setSelectionRange(len, len);
        } catch {
          // ignore
        }
        return;
      }
      if (attempt + 1 < maxAttempts) {
        this.scheduleAddDialogFocus(attempt + 1);
      }
    });
  }

  openAddDialogFromSearch(prefill: string): void {
    this.clearSearchOnSubmit = true;
    this.openAddDialog(prefill);
  }

  closeAddDialog(): void {
    this.addDialogVisible.set(false);
    this.dueQuickVisible.set(false);
    this.clearSearchOnSubmit = false;
    this.clearTaskAutocomplete();
    afterNextRender(() => {
      const addBtn = document.getElementById('addNoteButton');
      if (addBtn instanceof HTMLElement) safeFocus(addBtn);
    }, { injector: this.injector });
  }

  onFilterKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      const draft = this.filterQuery().trim();
      if (!draft) return;
      e.preventDefault();
      this.openAddDialogFromSearch(draft);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.filterQuery.set('');
      this.refresh();
      const addBtn = document.getElementById('addNoteButton');
      if (addBtn instanceof HTMLElement) safeFocus(addBtn);
    }
  }

  onNewTaskInput(value: string): void {
    this.newNoteText = value;
    this.scheduleTaskAutocomplete(value);
  }

  taskTabCompletion(): CompletionCandidate | null {
    const baseText = this.newNoteText;
    const local = this.taskLocalCompletion();
    if (local?.completion && baseText === local.baseText) return local;
    const ai = this.taskAiCompletion();
    if (ai?.completion && baseText === ai.baseText) return ai;
    return null;
  }

  taskAutocompleteVisible(): boolean {
    return (
      this.taskLocalSuggestions().length > 0 ||
      !!this.taskLocalCompletion()?.completion ||
      !!this.taskAiCompletion()?.completion ||
      this.taskAiPending() ||
      !!this.taskAiError()
    );
  }

  completionPreview(candidate: CompletionCandidate): string {
    return completionPreview(candidate);
  }

  onNewTaskKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    const candidate = this.taskTabCompletion();
    if (!candidate?.completion) return;
    event.preventDefault();
    event.stopPropagation();
    this.applyTaskCompletion(candidate);
  }

  applyTaskLocalSuggestion(value: string): void {
    this.newNoteText = value;
    this.scheduleTaskAutocomplete(value);
    afterNextRender(() => {
      const input = document.getElementById('noteText');
      if (input instanceof HTMLInputElement) safeFocus(input);
    }, { injector: this.injector });
  }

  applyTaskCompletionCandidate(candidate: CompletionCandidate): void {
    if (this.newNoteText !== candidate.baseText) return;
    this.applyTaskCompletion(candidate);
  }

  private applyTaskCompletion(candidate: CompletionCandidate): void {
    this.newNoteText = `${candidate.baseText}${candidate.completion}`;
    this.clearTaskAi();
    this.scheduleTaskAutocomplete(this.newNoteText);
    afterNextRender(() => {
      const input = document.getElementById('noteText');
      if (input instanceof HTMLInputElement) {
        safeFocus(input);
        try {
          const len = input.value.length;
          input.setSelectionRange(len, len);
        } catch {
          // ignore
        }
      }
    }, { injector: this.injector });
  }

  private scheduleTaskAutocomplete(value: string): void {
    if (this.taskLocalTimer) clearTimeout(this.taskLocalTimer);
    if (this.taskAiTimer) clearTimeout(this.taskAiTimer);

    const trimmed = String(value || '').trim();
    if (!trimmed) {
      this.clearTaskAutocomplete();
      return;
    }

    const suggestionsQuery = trimmed.includes(' ') ? getLastToken(trimmed) : trimmed;
    this.taskLocalTimer = setTimeout(() => {
      this.taskLocalSuggestions.set(this.autocomplete.queryLocalSuggestions(suggestionsQuery, 6));
      this.taskLocalCompletion.set(this.autocomplete.queryLocalCompletion(value));
      this.cdr.markForCheck();
    }, 140);

    this.clearTaskAi();
    const { baseUrl } = this.autocomplete.getAiConfig();
    if (!baseUrl || trimmed.length < 3) {
      this.cdr.markForCheck();
      return;
    }

    this.taskAiTimer = setTimeout(() => {
      void this.fetchTaskAiCompletion(value);
    }, 320);
  }

  private async fetchTaskAiCompletion(baseText: string): Promise<void> {
    this.taskAiAbort?.abort();
    const abort = new AbortController();
    this.taskAiAbort = abort;
    this.taskAiPending.set(true);
    this.taskAiError.set('');
    this.cdr.markForCheck();

    try {
      const candidate = await this.autocomplete.fetchAiCompletion(baseText, abort.signal);
      if (abort.signal.aborted || this.newNoteText !== baseText) return;
      this.taskAiCompletion.set(candidate);
    } catch (err) {
      if (abort.signal.aborted || this.newNoteText !== baseText) return;
      this.taskAiError.set(err instanceof Error ? err.message : 'request failed');
    } finally {
      if (!abort.signal.aborted && this.newNoteText === baseText) {
        this.taskAiPending.set(false);
        this.cdr.markForCheck();
      }
    }
  }

  private clearTaskAi(): void {
    this.taskAiAbort?.abort();
    this.taskAiAbort = null;
    this.taskAiCompletion.set(null);
    this.taskAiPending.set(false);
    this.taskAiError.set('');
  }

  private clearTaskAutocomplete(): void {
    if (this.taskLocalTimer) clearTimeout(this.taskLocalTimer);
    if (this.taskAiTimer) clearTimeout(this.taskAiTimer);
    this.taskLocalTimer = null;
    this.taskAiTimer = null;
    this.taskLocalSuggestions.set([]);
    this.taskLocalCompletion.set(null);
    this.clearTaskAi();
  }

  onEditorInput(noteId: number, event: Event): void {
    const editor = event.currentTarget;
    if (!(editor instanceof HTMLElement)) return;
    this.scheduleEditorAutocomplete(noteId, editor);
  }

  editorTabCompletion(noteId: number): CompletionCandidate | null {
    const baseText = this.getCaretPrefixText(noteId);
    const local = this.editorLocalCompletion();
    if (local?.completion && baseText === local.baseText) return local;
    const ai = this.editorAiCompletion();
    if (ai?.noteId === noteId && ai.candidate.completion && baseText === ai.candidate.baseText) return ai.candidate;
    return null;
  }

  editorAutocompleteVisible(noteId: number): boolean {
    if (this.editorAiCompletion()?.noteId !== noteId && !this.editorLocalCompletion()) {
      return this.editorLocalSuggestions().length > 0 || this.editorAiPending() || !!this.editorAiError();
    }
    return (
      this.editorLocalSuggestions().length > 0 ||
      !!this.editorLocalCompletion()?.completion ||
      (this.editorAiCompletion()?.noteId === noteId && !!this.editorAiCompletion()?.candidate.completion) ||
      this.editorAiPending() ||
      !!this.editorAiError()
    );
  }

  applyEditorLocalSuggestion(noteId: number, value: string): void {
    const editor = this.getEditorElement(noteId);
    if (!editor) return;
    editor.textContent = value;
    this.saveEditorHtml(noteId);
    this.scheduleEditorAutocomplete(noteId, editor);
    safeFocus(editor);
  }

  applyEditorCompletionCandidate(noteId: number, candidate: CompletionCandidate): void {
    const editor = this.getEditorElement(noteId);
    if (!editor || this.getCaretPrefixText(noteId) !== candidate.baseText) return;
    this.insertEditorCompletion(noteId, candidate.completion);
  }

  acceptEditorAiSuggestion(noteId: number, event?: KeyboardEvent): void {
    const candidate = this.editorTabCompletion(noteId);
    if (!candidate?.completion) return;
    event?.preventDefault();
    event?.stopPropagation();
    this.insertEditorCompletion(noteId, candidate.completion);
  }

  private insertEditorCompletion(noteId: number, completion: string): void {
    const editor = this.getEditorElement(noteId);
    if (!editor) return;
    editor.focus();
    try {
      document.execCommand('insertText', false, completion);
    } catch {
      const selection = window.getSelection();
      if (selection?.rangeCount) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(completion));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        editor.append(completion);
      }
    }
    this.clearEditorAi();
    this.scheduleEditorAutocomplete(noteId, editor);
    this.saveEditorHtml(noteId);
  }

  private scheduleEditorAutocomplete(noteId: number, editor: HTMLElement): void {
    if (this.editorLocalTimer) clearTimeout(this.editorLocalTimer);
    if (this.editorAiTimer) clearTimeout(this.editorAiTimer);

    const prefix = this.getCaretPrefixText(noteId, editor);
    const trimmed = prefix.trim();
    if (!trimmed) {
      this.clearEditorAutocomplete();
      this.hideEditorInlineTrail(noteId);
      return;
    }

    const suggestionsQuery = trimmed.includes(' ') ? getLastToken(trimmed) : trimmed;
    this.editorLocalTimer = setTimeout(() => {
      if (this.getCaretPrefixText(noteId, editor) !== prefix) return;
      this.editorLocalSuggestions.set(this.autocomplete.queryLocalSuggestions(suggestionsQuery, 6));
      this.editorLocalCompletion.set(this.autocomplete.queryLocalCompletion(prefix));
      this.renderEditorInlineTrail(noteId);
      this.cdr.markForCheck();
    }, 140);

    this.clearEditorAi();
    const { baseUrl } = this.autocomplete.getAiConfig();
    if (!baseUrl || trimmed.length < 3) {
      this.renderEditorInlineTrail(noteId);
      this.cdr.markForCheck();
      return;
    }

    this.editorAiNoteId = noteId;
    this.editorAiTimer = setTimeout(() => {
      void this.fetchEditorAiCompletion(noteId, prefix, editor);
    }, 320);
  }

  private async fetchEditorAiCompletion(noteId: number, baseText: string, editor: HTMLElement): Promise<void> {
    this.editorAiAbort?.abort();
    const abort = new AbortController();
    this.editorAiAbort = abort;
    this.editorAiPending.set(true);
    this.editorAiError.set('');
    this.cdr.markForCheck();

    try {
      const candidate = await this.autocomplete.fetchAiCompletion(baseText, abort.signal);
      if (abort.signal.aborted || this.editorAiNoteId !== noteId) return;
      if (this.getCaretPrefixText(noteId, editor) !== baseText) return;
      this.editorAiCompletion.set(candidate ? { noteId, candidate } : null);
      this.renderEditorInlineTrail(noteId);
    } catch (err) {
      if (abort.signal.aborted || this.editorAiNoteId !== noteId) return;
      this.editorAiError.set(err instanceof Error ? err.message : 'request failed');
    } finally {
      if (!abort.signal.aborted && this.editorAiNoteId === noteId) {
        this.editorAiPending.set(false);
        this.renderEditorInlineTrail(noteId);
        this.cdr.markForCheck();
      }
    }
  }

  private clearEditorAi(): void {
    this.editorAiAbort?.abort();
    this.editorAiAbort = null;
    this.editorAiCompletion.set(null);
    this.editorAiPending.set(false);
    this.editorAiError.set('');
  }

  private clearEditorAutocomplete(): void {
    if (this.editorLocalTimer) clearTimeout(this.editorLocalTimer);
    if (this.editorAiTimer) clearTimeout(this.editorAiTimer);
    this.editorLocalTimer = null;
    this.editorAiTimer = null;
    this.editorLocalSuggestions.set([]);
    this.editorLocalCompletion.set(null);
    this.clearEditorAi();
  }

  private getEditorElement(noteId: number): HTMLElement | null {
    return document.querySelector<HTMLElement>(`.noteEditorArea[data-note-id="${CSS.escape(String(noteId))}"]`);
  }

  private getCaretPrefixText(noteId: number, editorEl?: HTMLElement | null): string {
    const editor = editorEl ?? this.getEditorElement(noteId);
    if (!editor) return '';
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return editor.textContent || '';
      const range = sel.getRangeAt(0);
      if (!editor.contains(range.endContainer)) return editor.textContent || '';
      const pre = range.cloneRange();
      pre.selectNodeContents(editor);
      pre.setEnd(range.endContainer, range.endOffset);
      return pre.toString();
    } catch {
      return editor.textContent || '';
    }
  }

  private getEditorInlineTrail(noteId: number): HTMLElement | null {
    const editor = this.getEditorElement(noteId);
    const wrap = editor?.closest('.noteEditor');
    if (!(wrap instanceof HTMLElement)) return null;
    let trail = wrap.querySelector<HTMLElement>('.noteEditorInlineTrail');
    if (!trail) {
      trail = document.createElement('div');
      trail.className = 'noteEditorInlineTrail';
      trail.hidden = true;
      trail.setAttribute('aria-hidden', 'true');
      wrap.appendChild(trail);
    }
    return trail;
  }

  private hideEditorInlineTrail(noteId: number): void {
    const trail = this.getEditorInlineTrail(noteId);
    if (!trail) return;
    trail.textContent = '';
    trail.hidden = true;
  }

  refreshEditorInlineTrail(noteId: number): void {
    this.renderEditorInlineTrail(noteId);
  }

  private renderEditorInlineTrail(noteId: number): void {
    const editor = this.getEditorElement(noteId);
    const trail = this.getEditorInlineTrail(noteId);
    const wrap = editor?.closest('.noteEditor');
    if (!editor || !trail || !(wrap instanceof HTMLElement)) return;

    const candidate = this.editorTabCompletion(noteId);
    if (!candidate?.completion || document.activeElement !== editor) {
      this.hideEditorInlineTrail(noteId);
      return;
    }

    const caretRect = this.getCaretClientRect(editor);
    if (!caretRect) {
      this.hideEditorInlineTrail(noteId);
      return;
    }

    const wrapRect = wrap.getBoundingClientRect();
    const cs = getComputedStyle(editor);
    trail.style.fontFamily = cs.fontFamily;
    trail.style.fontSize = cs.fontSize;
    trail.style.fontWeight = cs.fontWeight;
    trail.style.letterSpacing = cs.letterSpacing;
    trail.style.lineHeight = cs.lineHeight;
    trail.textContent = candidate.completion;
    trail.hidden = false;
    trail.style.left = `${Math.max(0, caretRect.left - wrapRect.left)}px`;
    trail.style.top = `${Math.max(0, caretRect.top - wrapRect.top)}px`;
  }

  private getCaretClientRect(editor: HTMLElement): DOMRect | null {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      if (!editor.contains(range.endContainer)) return null;
      const rects = range.getClientRects();
      if (rects.length) return rects[0];
      const br = range.getBoundingClientRect();
      return br.width || br.height ? br : null;
    } catch {
      return null;
    }
  }

  onEditorKeydown(noteId: number, event: KeyboardEvent): void {
    if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!this.editorTabCompletion(noteId)?.completion) return;
    this.acceptEditorAiSuggestion(noteId, event);
  }

  onDueDateFocus(): void {
    this.dueQuickVisible.set(true);
  }

  editDueDate(note: Note): void {
    this.editingDueNoteId.set(note.id);
    this.dueEditValue = note.due_at ? dateToDateInputValue(new Date(note.due_at)) : '';
    afterNextRender(() => safeFocus(document.querySelector<HTMLElement>(`[data-due-editor="${note.id}"]`)), {
      injector: this.injector,
    });
  }

  async saveInlineDueDate(note: Note): Promise<void> {
    if (this.editingDueNoteId() !== note.id) return;
    const raw = this.dueEditValue;
    const dueAt = raw ? Date.parse(`${raw}T00:00:00Z`) : null;
    if (raw && !Number.isFinite(dueAt)) return;
    this.repo.updateDueAt(note.id, dueAt);
    await this.dbService.persist();
    await this.obsidian.pushNoteById(note.id);
    this.editingDueNoteId.set(null);
    this.refresh();
  }

  cancelInlineDueDate(): void {
    this.editingDueNoteId.set(null);
    this.dueEditValue = '';
  }

  onInlineDueDateKeydown(note: Note, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.saveInlineDueDate(note);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelInlineDueDate();
    }
  }

  setDueQuick(kind: string): void {
    const now = new Date();
    let target = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (kind === '1w') target.setDate(target.getDate() + 7);
    else if (kind === '2w') target.setDate(target.getDate() + 14);
    else if (kind === '1mo') target = addCalendarMonthsClamped(target, 1);
    else if (kind !== 'today') return;
    this.newNoteDue = dateToDateInputValue(target);
    this.dueQuickVisible.set(false);
    const dueInput = document.getElementById('noteDueDate');
    if (dueInput instanceof HTMLElement) safeFocus(dueInput);
  }

  async submitNote(): Promise<void> {
    const text = this.newNoteText.trim();
    if (!text) return;
    let dueAt: number | null = null;
    if (this.newNoteDue) {
      const d = new Date(this.newNoteDue + 'T00:00:00');
      dueAt = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const noteId = this.repo.insertNote(this.state.activeBoard(), text, dueAt);
    await this.dbService.persist();
    if (Number.isFinite(noteId)) await this.obsidian.pushNoteById(noteId);
    this.addDialogVisible.set(false);
    this.newNoteText = '';
    this.newNoteDue = '';
    this.dueQuickVisible.set(false);
    this.clearTaskAutocomplete();
    if (this.clearSearchOnSubmit) {
      this.filterQuery.set('');
      this.clearSearchOnSubmit = false;
    }
    this.refresh();
  }

  async toggleComplete(note: Note): Promise<void> {
    if (note.status === 'pending') {
      await this.animateComplete(note);
      return;
    }
    this.repo.setStatus(note.id, 'pending');
    await this.dbService.persist();
    await this.obsidian.pushNoteById(note.id);
    this.refresh();
  }

  isCompleting(noteId: number): boolean {
    return this.completingNoteIds().includes(noteId);
  }

  isDeleting(noteId: number): boolean {
    return this.deletingNoteIds().includes(noteId);
  }

  isMoving(noteId: number): boolean {
    return this.movingNoteIds().includes(noteId);
  }

  isDragging(noteId: number): boolean {
    return this.draggedNoteId() === noteId;
  }

  isReorderTarget(noteId: number, edge: 'before' | 'after'): boolean {
    return this.reorderTargetNoteId() === noteId && this.reorderTargetEdge() === edge;
  }

  async cyclePriority(note: Note): Promise<void> {
    this.repo.togglePriority(note.id);
    await this.dbService.persist();
    this.refresh();
  }

  confirmDelete(note: Note): void {
    this.openDeleteDialog(note);
  }

  deletePreviewText(): string {
    const note = this.deleteTarget();
    if (!note) return '';
    const text = note.text.trim();
    if (!text) return 'this task';
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  }

  openDeleteDialog(note: Note): void {
    this.deleteTarget.set(note);
    this.deleteReturnFocusNoteId = note.id;
    this.deleteDialogVisible.set(true);
    afterNextRender(() => this.scheduleDeleteDialogFocus(), { injector: this.injector });
  }

  closeDeleteDialog(): void {
    const noteId = this.deleteReturnFocusNoteId;
    this.deleteDialogVisible.set(false);
    this.deleteTarget.set(null);
    this.deleteReturnFocusNoteId = null;
    afterNextRender(() => this.focusDeleteButton(noteId), { injector: this.injector });
  }

  async confirmDeleteDialog(): Promise<void> {
    const note = this.deleteTarget();
    if (!note) return;
    this.deleteDialogVisible.set(false);
    this.deleteTarget.set(null);
    this.deleteReturnFocusNoteId = null;
    await this.deleteNote(note);
  }

  private async deleteNote(note: Note): Promise<void> {
    if (this.isDeleting(note.id)) return;
    const shouldAnimate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (shouldAnimate) {
      this.deletingNoteIds.update((ids) => [...ids, note.id]);
      this.cdr.detectChanges();
      const card = document.querySelector<HTMLElement>(`.noteCard[data-note-id="${CSS.escape(String(note.id))}"]`);
      const burn = card ? this.animateCompizBurn(card.getBoundingClientRect()) : Promise.resolve();
      await Promise.all([this.wait(NotesComponent.DELETE_ANIMATION_MS), burn]);
    }

    try {
      await this.obsidian.forgetFilePath(note.id);
      this.repo.deleteNote(note.id);
      await this.dbService.persist();
      this.refresh();
    } finally {
      if (shouldAnimate) this.deletingNoteIds.update((ids) => ids.filter((id) => id !== note.id));
    }
  }

  async move(note: Note, dir: 'up' | 'down'): Promise<void> {
    this.repo.reorderPending(note.id, note.board, dir);
    await this.dbService.persist();
    this.refresh();
  }

  handleNoteDragStart(note: Note, event: DragEvent): void {
    if (this.isCompleting(note.id) || this.isDeleting(note.id) || this.isMoving(note.id)) {
      event.preventDefault();
      return;
    }
    this.draggedNoteId.set(note.id);
    this.dragHoverBoard.set('');
    this.reorderTargetNoteId.set(null);
    this.reorderTargetEdge.set(null);
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;
    dataTransfer.effectAllowed = 'move';
    dataTransfer.setData('text/plain', String(note.id));
    const card = event.currentTarget instanceof HTMLElement ? event.currentTarget : getCardFromElement(event.target as Element | null);
    if (card instanceof HTMLElement) {
      dataTransfer.setDragImage(card, Math.min(32, card.clientWidth / 4), 20);
    }
  }

  handleNoteDragEnd(): void {
    this.clearDragState();
  }

  handleBoardTabDragOver(board: string, event: DragEvent): void {
    const dragged = this.draggedNote();
    if (!dragged || dragged.board === board) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragHoverBoard.set(board);
  }

  handleBoardTabDragLeave(board: string, event: DragEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Element && next.closest(`[data-board="${CSS.escape(board)}"]`)) return;
    if (this.dragHoverBoard() === board) this.dragHoverBoard.set('');
  }

  async handleBoardTabDrop(board: string, event: DragEvent): Promise<void> {
    const dragged = this.draggedNote();
    if (!dragged || dragged.board === board) return;
    event.preventDefault();

    const sourceCard = document.querySelector<HTMLElement>(`.noteCard[data-note-id="${CSS.escape(String(dragged.id))}"]`);
    const targetTab = document.querySelector<HTMLElement>(`#boardTabs [data-board="${CSS.escape(board)}"]`);
    this.dragHoverBoard.set('');
    await this.animateBoardTransfer(dragged, board, sourceCard, targetTab);
    this.clearDragState();
  }

  handlePendingListDragOver(event: DragEvent): void {
    const dragged = this.draggedNote();
    if (!dragged || dragged.status !== 'pending' || dragged.board !== this.state.activeBoard()) return;
    const targetCard = (event.target instanceof Element ? event.target.closest('.noteCard[data-note-id]') : null);
    if (targetCard) return;
    event.preventDefault();
    this.reorderTargetNoteId.set(null);
    this.reorderTargetEdge.set('after');
  }

  async handlePendingListDrop(event: DragEvent): Promise<void> {
    const dragged = this.draggedNote();
    if (!dragged || dragged.status !== 'pending' || dragged.board !== this.state.activeBoard()) return;
    const targetCard = event.target instanceof Element ? event.target.closest('.noteCard[data-note-id]') : null;
    if (targetCard) return;
    event.preventDefault();
    await this.reorderPendingDrop(dragged, null, 'after');
  }

  handlePendingCardDragOver(note: Note, event: DragEvent): void {
    const dragged = this.draggedNote();
    if (!dragged || dragged.status !== 'pending' || dragged.board !== this.state.activeBoard() || dragged.id === note.id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const edge = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    this.reorderTargetNoteId.set(note.id);
    this.reorderTargetEdge.set(edge);
  }

  async handlePendingCardDrop(note: Note, event: DragEvent): Promise<void> {
    const dragged = this.draggedNote();
    if (!dragged || dragged.status !== 'pending' || dragged.board !== this.state.activeBoard() || dragged.id === note.id) return;
    event.preventDefault();
    await this.reorderPendingDrop(dragged, note, this.reorderTargetEdge() ?? 'before');
  }

  flipped = new Set<number>();
  openEditors = new Set<number>();

  toggleFlip(noteId: number): void {
    const opening = !this.flipped.has(noteId);
    if (opening) this.flipped.add(noteId);
    else this.unflipNote(noteId);
    if (opening) {
      this.cdr.detectChanges();
      afterNextRender(() => {
        morphCardHeightByNoteId(noteId);
        this.focusLinksPanelEntry(noteId);
      }, { injector: this.injector });
    }
  }

  private focusLinksPanelEntry(noteId: number): void {
    const card = document.querySelector<HTMLElement>(
      `.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`
    );
    if (!card) return;
    const descInput = card.querySelector<HTMLInputElement>(".linkForm input[name='description']");
    const urlInput = card.querySelector<HTMLInputElement>(".linkForm input[name='url']");
    const firstLink = card.querySelector<HTMLElement>('.linkList a[href]');
    const closeBtn = card.querySelector<HTMLElement>("button[data-action='unflip']");
    if (descInput && safeFocus(descInput)) return;
    if (urlInput && safeFocus(urlInput)) return;
    if (firstLink && safeFocus(firstLink)) return;
    if (closeBtn) safeFocus(closeBtn);
  }

  private focusLinksButton(noteId: number): void {
    const card = document.querySelector<HTMLElement>(
      `.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`
    );
    const flipBtn = card?.querySelector<HTMLElement>("button[data-action='flip']");
    if (flipBtn) safeFocus(flipBtn);
  }

  linkDraft(noteId: number): LinkDraft {
    let draft = this.linkDraftByNoteId.get(noteId);
    if (!draft) {
      draft = { description: '', url: '' };
      this.linkDraftByNoteId.set(noteId, draft);
    }
    return draft;
  }

  linkFormId(noteId: number): string {
    return `linkForm-${noteId}`;
  }

  async submitLink(note: Note, event: Event): Promise<void> {
    event.preventDefault();
    const draft = this.linkDraft(note.id);
    const description = draft.description.trim();
    if (!description) return;
    const url = normalizeUrl(draft.url);
    if (!url) return;
    this.repo.insertLink(note.id, url, description);
    draft.description = '';
    draft.url = '';
    this.flipped.add(note.id);
    await this.dbService.persist();
    this.refresh();
    this.cdr.detectChanges();
    afterNextRender(() => {
      morphCardHeightByNoteId(note.id);
      const form = document.getElementById(this.linkFormId(note.id));
      const descInput = form?.querySelector<HTMLInputElement>("input[name='description']");
      if (descInput) safeFocus(descInput);
    }, { injector: this.injector });
  }

  isFlipped(noteId: number): boolean {
    return this.flipped.has(noteId);
  }

  async toggleEditor(note: Note): Promise<void> {
    if (this.openEditors.has(note.id)) {
      void this.saveEditorHtml(note.id).finally(() => {
        this.openEditors.delete(note.id);
        this.refresh();
        this.cdr.detectChanges();
      });
      return;
    }
    await this.obsidian.ensureVaultAccess();
    const result = await this.obsidian.syncBeforeEditorOpen(note.id);
    if (result.kind === 'conflict') {
      this.obsidianConflict.present(result.conflict, 'editor');
      return;
    }
    this.applyObsidianResult(result);
    this.refresh();
    this.openEditors.add(note.id);
    this.cdr.detectChanges();
    afterNextRender(() => this.scheduleNotesEditorFocus(note.id), { injector: this.injector });
  }

  cycleAddDialogFocus(delta: 1 | -1): boolean {
    const targets = this.addDialogFocusables();
    if (!targets.length) return false;
    const currentIndex = targets.indexOf(document.activeElement as HTMLElement);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + delta + targets.length) % targets.length;
    return safeFocus(targets[nextIndex]);
  }

  moveAddDialogFocus(direction: 'left' | 'right' | 'up' | 'down'): boolean {
    const form = document.getElementById('createForm');
    const active = document.activeElement;
    if (!(form instanceof HTMLElement) || !(active instanceof HTMLElement)) return false;

    const targets = [...form.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')].filter(
      (target) => !target.closest('[hidden]') && target.getClientRects().length > 0
    );
    if (!targets.includes(active)) return false;

    const dueInput = document.getElementById('noteDueDate');
    if (active === dueInput && (direction === 'right' || direction === 'down')) {
      this.dueQuickVisible.set(true);
      afterNextRender(() => safeFocus(document.querySelector<HTMLElement>('[data-due-quick="today"]')), {
        injector: this.injector,
      });
      return true;
    }

    const currentRect = active.getBoundingClientRect();
    const centerX = currentRect.left + currentRect.width / 2;
    const centerY = currentRect.top + currentRect.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const target of targets) {
      if (target === active) continue;
      const rect = target.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - centerX;
      const dy = rect.top + rect.height / 2 - centerY;
      const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
      if (primary <= 2) continue;
      const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      const overlaps =
        direction === 'left' || direction === 'right'
          ? rect.bottom >= currentRect.top && rect.top <= currentRect.bottom
          : rect.right >= currentRect.left && rect.left <= currentRect.right;
      const score = primary * 100 + secondary + (overlaps ? 0 : 10_000);
      if (score < bestScore) {
        best = target;
        bestScore = score;
      }
    }
    return best ? safeFocus(best) : false;
  }

  private addDialogFocusables(): HTMLElement[] {
    const panel = document.querySelector<HTMLElement>('.addNoteModalPanel');
    if (!panel) return [];
    return [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
      (target) => !target.closest('[hidden]') && target.getClientRects().length > 0
    );
  }

  cycleDeleteDialogFocus(delta: 1 | -1): boolean {
    const targets = this.deleteDialogFocusables();
    if (!targets.length) return false;
    const currentIndex = targets.indexOf(document.activeElement as HTMLElement);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + delta + targets.length) % targets.length;
    return safeFocus(targets[nextIndex]);
  }

  moveDeleteDialogFocus(direction: 'left' | 'right' | 'up' | 'down'): boolean {
    const cancel = document.getElementById('deleteNoteModalCancel');
    const confirm = document.getElementById('deleteNoteModalConfirm');
    if (!(cancel instanceof HTMLElement) || !(confirm instanceof HTMLElement)) return false;
    const active = document.activeElement;
    if (direction === 'left' || direction === 'up') {
      if (active === confirm) return safeFocus(cancel);
    }
    if (direction === 'right' || direction === 'down') {
      if (active === cancel) return safeFocus(confirm);
    }
    return false;
  }

  private deleteDialogFocusables(): HTMLElement[] {
    const panel = document.querySelector<HTMLElement>('.deleteNoteModalPanel');
    if (!panel) return [];
    return [...panel.querySelectorAll<HTMLElement>('button:not([disabled])')].filter(
      (target) => target.getClientRects().length > 0
    );
  }

  private scheduleDeleteDialogFocus(attempt = 0): void {
    const maxAttempts = 12;
    requestAnimationFrame(() => {
      const cancel = document.getElementById('deleteNoteModalCancel');
      if (cancel instanceof HTMLElement && safeFocus(cancel)) return;
      if (attempt + 1 < maxAttempts) this.scheduleDeleteDialogFocus(attempt + 1);
    });
  }

  private focusDeleteButton(noteId: number | null): void {
    if (!noteId) return;
    const card = document.querySelector<HTMLElement>(
      `.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`
    );
    const deleteBtn = card?.querySelector<HTMLElement>('button[data-action="deleteNote"]');
    if (deleteBtn) safeFocus(deleteBtn);
  }

  private async animateComplete(note: Note): Promise<void> {
    if (this.isCompleting(note.id)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await this.persistCompletion(note);
      return;
    }

    const sourceCard = document.querySelector<HTMLElement>(`.noteCard[data-note-id="${CSS.escape(String(note.id))}"]`);
    const completeColumn = document.getElementById('colComplete');
    const completeList = document.getElementById('completeList');
    if (!(sourceCard instanceof HTMLElement) || !(completeColumn instanceof HTMLElement) || !(completeList instanceof HTMLElement)) {
      await this.persistCompletion(note);
      return;
    }

    this.completingNoteIds.set([...this.completingNoteIds(), note.id]);
    this.bumpCompleteRailPulse();
    const cleanupGhost = this.animateGhostToTarget(sourceCard, this.resolveCompleteGhostTarget(completeColumn, completeList));

    try {
      await this.wait(NotesComponent.COMPLETE_ANIMATION_MS);
      await this.persistCompletion(note);
      afterNextRender(() => {
        const movedCard = document.querySelector<HTMLElement>(`.noteCard[data-note-id="${CSS.escape(String(note.id))}"]`);
        if (movedCard) {
          focusCardPrimaryAction(movedCard);
        } else {
          safeFocus(completeColumn);
        }
      }, { injector: this.injector });
    } finally {
      cleanupGhost();
      this.completingNoteIds.set(this.completingNoteIds().filter((id) => id !== note.id));
    }
  }

  private animateGhostToTarget(sourceCard: HTMLElement, targetRect: DOMRect): () => void {
    const startRect = sourceCard.getBoundingClientRect();
    const ghost = sourceCard.cloneNode(true);
    if (!(ghost instanceof HTMLElement)) return () => void 0;

    ghost.classList.remove('is-completing', 'is-flipped', 'is-notes-open');
    ghost.style.position = 'fixed';
    ghost.style.left = `${startRect.left}px`;
    ghost.style.top = `${startRect.top}px`;
    ghost.style.width = `${startRect.width}px`;
    ghost.style.height = `${startRect.height}px`;
    ghost.style.margin = '0';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '1000';
    ghost.style.overflow = 'hidden';
    ghost.style.transformOrigin = 'top left';
    ghost.style.willChange = 'transform, opacity';
    ghost.style.boxShadow = '0 14px 32px rgba(23, 34, 56, 0.18)';
    document.body.appendChild(ghost);

    const deltaX = targetRect.left - startRect.left;
    const deltaY = targetRect.top - startRect.top;
    const scaleX = targetRect.width / Math.max(startRect.width, 1);
    const scaleY = targetRect.height / Math.max(startRect.height, 1);
    const animation = ghost.animate(
      [
        { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 0.96, offset: 0 },
        { transform: `translate3d(${deltaX * 0.45}px, ${Math.max(8, deltaY * 0.15)}px, 0) scale(0.985, 0.975)`, opacity: 0.9, offset: 0.45 },
        { transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`, opacity: 0.12, offset: 1 },
      ],
      {
        duration: NotesComponent.COMPLETE_ANIMATION_MS,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards',
      }
    );

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      animation.cancel();
      ghost.remove();
    };
    animation.addEventListener('finish', cleanup, { once: true });
    return cleanup;
  }

  private resolveCompleteGhostTarget(completeColumn: HTMLElement, completeList: HTMLElement): DOMRect {
    const firstCard = completeList.querySelector<HTMLElement>('.noteCard[data-note-id]');
    if (firstCard instanceof HTMLElement) return firstCard.getBoundingClientRect();

    const listRect = completeList.getBoundingClientRect();
    const columnRect = completeColumn.getBoundingClientRect();
    const width = Math.max(180, columnRect.width - 24);
    const height = 54;
    return new DOMRect(listRect.left, listRect.top + 10, width, height);
  }

  private async persistCompletion(note: Note): Promise<void> {
    this.repo.setStatus(note.id, 'complete');
    await this.dbService.persist();
    await this.obsidian.pushNoteById(note.id);
    this.refresh();
  }

  private async animateBoardTransfer(
    note: Note,
    targetBoard: string,
    sourceCard: HTMLElement | null,
    targetTab: HTMLElement | null
  ): Promise<void> {
    if (this.isMoving(note.id)) return;
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !(sourceCard instanceof HTMLElement) ||
      !(targetTab instanceof HTMLElement)
    ) {
      await this.persistBoardMove(note, targetBoard);
      return;
    }

    this.movingNoteIds.set([...this.movingNoteIds(), note.id]);
    this.bumpBoardTransferPulse(targetBoard);
    const cleanupGhost = this.animateGhostToTarget(sourceCard, targetTab.getBoundingClientRect());

    try {
      await this.wait(NotesComponent.COMPLETE_ANIMATION_MS);
      await this.persistBoardMove(note, targetBoard);
      safeFocus(targetTab);
    } finally {
      cleanupGhost();
      this.movingNoteIds.set(this.movingNoteIds().filter((id) => id !== note.id));
    }
  }

  private async persistBoardMove(note: Note, targetBoard: string): Promise<void> {
    this.repo.moveNoteToBoard(note.id, targetBoard);
    await this.dbService.persist();
    await this.obsidian.pushNoteById(note.id);
    this.refresh();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  // A WebGL overlay keeps the fire simulation off the board's paint path.
  private animateCompizBurn(rect: DOMRect): Promise<void> {
    const canvas = document.createElement('canvas');
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.ceil(width * pixelRatio);
    canvas.height = Math.ceil(height * pixelRatio);
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;';
    document.body.append(canvas);

    const context = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!context) {
      canvas.remove();
      return Promise.resolve();
    }

    const compile = (type: number, source: string): WebGLShader | null => {
      const shader = context.createShader(type);
      if (!shader) return null;
      context.shaderSource(shader, source);
      context.compileShader(shader);
      return context.getShaderParameter(shader, context.COMPILE_STATUS) ? shader : null;
    };
    const vertex = compile(
      context.VERTEX_SHADER,
      `attribute vec4 a_particle;
       attribute vec3 a_color;
       uniform vec2 u_resolution;
       varying vec4 v_color;
       void main() {
         vec2 clip = (a_particle.xy / u_resolution) * 2.0 - 1.0;
         gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
         gl_PointSize = a_particle.z;
         v_color = vec4(a_color, a_particle.w);
       }`
    );
    const fragment = compile(
      context.FRAGMENT_SHADER,
      `precision mediump float;
       varying vec4 v_color;
       void main() {
         vec2 point = gl_PointCoord - vec2(0.5);
         float distance = length(point);
         float flame = 1.0 - smoothstep(0.08, 0.5, distance);
         float core = 1.0 - smoothstep(0.0, 0.2, distance);
         vec3 color = mix(v_color.rgb, vec3(1.0, 0.94, 0.56), core);
         gl_FragColor = vec4(color, v_color.a * flame);
       }`
    );
    const program = context.createProgram();
    if (!vertex || !fragment || !program) {
      canvas.remove();
      return Promise.resolve();
    }
    context.attachShader(program, vertex);
    context.attachShader(program, fragment);
    context.linkProgram(program);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      canvas.remove();
      return Promise.resolve();
    }

    const particleCount = Math.max(180, Math.round(rect.width * 1.6));
    const frontCount = 54;
    const particles = Array.from({ length: particleCount }, () => {
      const x = rect.left + Math.random() * rect.width;
      const y = rect.top + Math.random() * rect.height;
      const depth = (y - rect.top) / Math.max(rect.height, 1);
      return {
        x,
        y,
        delay: (1 - depth) * 0.58 + Math.random() * 0.11,
        drift: (Math.random() - 0.5) * 36,
        lift: 24 + Math.random() * 66,
        radius: 1.5 + Math.random() * 5.5,
        hue: Math.random() > 0.72 ? 52 : Math.random() > 0.4 ? 26 : 8,
      };
    });
    const buffer = context.createBuffer();
    const particleLocation = context.getAttribLocation(program, 'a_particle');
    const colorLocation = context.getAttribLocation(program, 'a_color');
    const resolutionLocation = context.getUniformLocation(program, 'u_resolution');
    if (!buffer || particleLocation < 0 || colorLocation < 0 || !resolutionLocation) {
      canvas.remove();
      return Promise.resolve();
    }
    const stride = 7;
    const frameData = new Float32Array((particleCount + frontCount) * stride);
    context.useProgram(program);
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.enableVertexAttribArray(particleLocation);
    context.vertexAttribPointer(particleLocation, 4, context.FLOAT, false, stride * 4, 0);
    context.enableVertexAttribArray(colorLocation);
    context.vertexAttribPointer(colorLocation, 3, context.FLOAT, false, stride * 4, 4 * 4);
    context.uniform2f(resolutionLocation, canvas.width, canvas.height);
    context.viewport(0, 0, canvas.width, canvas.height);
    context.enable(context.BLEND);
    context.blendFunc(context.SRC_ALPHA, context.ONE);

    return new Promise((resolve) => {
      const startedAt = performance.now();
      const duration = NotesComponent.DELETE_ANIMATION_MS;
      const writeParticle = (index: number, x: number, y: number, size: number, alpha: number, hue: number): void => {
        const offset = index * stride;
        const warmth = hue / 55;
        frameData[offset] = x * pixelRatio;
        frameData[offset + 1] = y * pixelRatio;
        frameData[offset + 2] = size * pixelRatio;
        frameData[offset + 3] = alpha;
        frameData[offset + 4] = 1;
        frameData[offset + 5] = 0.08 + warmth * 0.7;
        frameData[offset + 6] = warmth * 0.18;
      };

      const render = (now: number): void => {
        const progress = Math.min((now - startedAt) / duration, 1);
        const burnFront = rect.bottom - rect.height * Math.min(progress * 1.18, 1);
        let index = 0;

        for (let flameIndex = 0; flameIndex < frontCount; flameIndex += 1) {
          const flameProgress = (flameIndex / frontCount + progress * 0.72) % 1;
          const x = rect.left + flameProgress * rect.width;
          const wobble = Math.sin(progress * 22 + flameIndex * 2.7) * 11;
          const size = 11 + ((flameIndex * 13) % 18);
          writeParticle(index, x, burnFront + wobble, size, Math.max(0, 0.84 - progress * 0.36), flameIndex % 3 === 0 ? 52 : 20);
          index += 1;
        }

        for (const particle of particles) {
          const life = progress < particle.delay ? 0 : Math.min((progress - particle.delay) / (1 - particle.delay), 1);
          const alpha = life === 0 ? 0 : (1 - life) * Math.min(1, life * 7) * 0.94;
          const x = particle.x + particle.drift * life + Math.sin(life * 13 + particle.y) * 3;
          const y = particle.y - particle.lift * life - life * life * 48;
          writeParticle(index, x, y, particle.radius * (1 - life * 0.42), alpha, particle.hue);
          index += 1;
        }

        context.clear(context.COLOR_BUFFER_BIT);
        context.bufferData(context.ARRAY_BUFFER, frameData, context.DYNAMIC_DRAW);
        context.drawArrays(context.POINTS, 0, index);
        if (progress < 1) {
          requestAnimationFrame(render);
          return;
        }
        canvas.remove();
        resolve();
      };

      requestAnimationFrame(render);
    });
  }

  private bumpCompleteRailPulse(): void {
    const token = this.completeRailPulse() + 1;
    this.completeRailPulse.set(token);
    window.setTimeout(() => {
      if (this.completeRailPulse() === token) this.completeRailPulse.set(0);
    }, NotesComponent.COMPLETE_ANIMATION_MS + 80);
  }

  private bumpBoardTransferPulse(board: string): void {
    this.boardTransferPulse.set(board);
    window.setTimeout(() => {
      if (this.boardTransferPulse() === board) this.boardTransferPulse.set('');
    }, NotesComponent.COMPLETE_ANIMATION_MS + 80);
  }

  private draggedNote(): Note | null {
    const noteId = this.draggedNoteId();
    if (!noteId) return null;
    return this.notes().find((note) => note.id === noteId) ?? null;
  }

  private async reorderPendingDrop(
    dragged: Note,
    target: Note | null,
    edge: 'before' | 'after'
  ): Promise<void> {
    const notes = this.pendingNotes();
    const draggedIndex = notes.findIndex((note) => note.id === dragged.id);
    if (draggedIndex < 0) {
      this.clearDragState();
      return;
    }

    let targetIndex = notes.length - 1;
    if (target) {
      const rawTargetIndex = notes.findIndex((note) => note.id === target.id);
      if (rawTargetIndex < 0) {
        this.clearDragState();
        return;
      }
      targetIndex = rawTargetIndex + (edge === 'after' ? 1 : 0);
      if (draggedIndex < targetIndex) targetIndex -= 1;
    }

    this.repo.reorderPendingToIndex(dragged.id, dragged.board, targetIndex);
    await this.dbService.persist();
    this.refresh();
    this.clearDragState();
    afterNextRender(() => {
      const card = document.querySelector<HTMLElement>(`.noteCard[data-note-id="${CSS.escape(String(dragged.id))}"]`);
      if (card) focusCardPrimaryAction(card);
    }, { injector: this.injector });
  }

  private clearDragState(): void {
    this.draggedNoteId.set(null);
    this.dragHoverBoard.set('');
    this.reorderTargetNoteId.set(null);
    this.reorderTargetEdge.set(null);
  }

  async openInObsidian(note: Note): Promise<void> {
    await this.obsidian.ensureVaultAccess();
    if (this.openEditors.has(note.id)) {
      await this.saveEditorHtml(note.id, { skipVaultPush: true });
    }
    const syncResult = await this.obsidian.syncWithVault(note.id);
    if (syncResult.kind === 'conflict') {
      this.obsidianConflict.present(syncResult.conflict, 'obsidian');
      return;
    }
    if (syncResult.kind === 'error') {
      this.applyObsidianResult(syncResult);
      return;
    }
    const navResult = await this.obsidian.navigateToNote(note.id);
    this.applyObsidianResult(navResult);
  }

  obsidianConfigured(): boolean {
    return this.obsidian.isConfigured();
  }

  dismissObsidianMessage(): void {
    this.obsidianMessage.set('');
    this.obsidianMessageKind.set('');
  }

  private applyObsidianResult(result: ObsidianOpResult): boolean {
    if (result.kind === 'conflict') {
      this.obsidianConflict.present(result.conflict, 'obsidian');
      return false;
    }
    if (result.kind === 'error') {
      this.obsidianMessageKind.set('error');
      this.obsidianMessage.set(result.message);
      this.cdr.detectChanges();
      return false;
    }
    if (result.warning) {
      this.obsidianMessageKind.set('warning');
      this.obsidianMessage.set(result.warning);
    } else {
      this.obsidianMessage.set('');
      this.obsidianMessageKind.set('');
    }
    this.cdr.detectChanges();
    return true;
  }

  private scheduleNotesEditorFocus(noteId: number, attempt = 0): void {
    const maxAttempts = 12;
    requestAnimationFrame(() => {
      if (!this.openEditors.has(noteId)) return;
      if (!this.seedEditorContent(noteId)) {
        if (attempt + 1 < maxAttempts) {
          this.scheduleNotesEditorFocus(noteId, attempt + 1);
        }
        return;
      }
      if (this.vimEditor.focusEditorForEditing(noteId)) return;
      if (attempt + 1 < maxAttempts) {
        this.scheduleNotesEditorFocus(noteId, attempt + 1);
      }
    });
  }

  /** Seed editor DOM once on open; avoid [innerHTML] binding while typing. */
  private seedEditorContent(noteId: number): boolean {
    const editor = document.querySelector(
      `.noteEditorArea[data-note-id="${CSS.escape(String(noteId))}"]`
    );
    if (!(editor instanceof HTMLElement)) return false;
    const note = this.notes().find((n) => n.id === noteId);
    applyMarkdownToEditor(editor, notesContentForEditorSeed(note?.notes_html ?? ''));
    return true;
  }

  editorOpen(noteId: number): boolean {
    return this.openEditors.has(noteId);
  }

  hasNotesPreview(note: Note): boolean {
    return hasNotesPreviewContent(note.notes_html);
  }

  notesPreviewMarkdown(note: Note): string {
    return notesContentToPreviewMarkdown(note.notes_html);
  }

  links(note: Note) {
    return this.repo.queryLinks(note.id);
  }

  async deleteLink(linkId: number, noteId: number): Promise<void> {
    this.repo.deleteLink(linkId);
    this.flipped.add(noteId);
    await this.dbService.persist();
    this.refresh();
    this.cdr.detectChanges();
    afterNextRender(() => morphCardHeightByNoteId(noteId), { injector: this.injector });
  }

  formatDue = formatDueDate;
  formatPriority = formatPriorityLabel;
  nextPriority = nextPriority;
}
