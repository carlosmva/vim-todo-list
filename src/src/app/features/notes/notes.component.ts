import { Component, OnDestroy, OnInit, ChangeDetectorRef, Injector, afterNextRender, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MarkdownComponent } from 'ngx-markdown';
import { AppStateService } from '../../core/services/app-state.service';
import { DatabaseService } from '../../core/services/database.service';
import { ObsidianService } from '../../core/services/obsidian.service';
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

@Component({
  selector: 'app-notes',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownComponent],
  templateUrl: './notes.component.html',
  styleUrl: './notes.component.scss',
})
export class NotesComponent implements OnInit, OnDestroy {
  private static readonly NOTES_PAGE_SIZE = 24;
  readonly state = inject(AppStateService);
  private readonly repo = inject(NotesRepository);
  private readonly ribbon = inject(PriorityRibbonService);
  private readonly dbService = inject(DatabaseService);
  private readonly obsidian = inject(ObsidianService);
  private readonly keyboardBridge = inject(NotesKeyboardBridge);
  private readonly vimEditor = inject(NotesVimEditorService);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);

  boards = signal<string[]>([]);
  notes = signal<Note[]>([]);
  pendingCountsByBoard = signal<Map<string, number>>(new Map());
  readonly pendingVisibleCount = signal(NotesComponent.NOTES_PAGE_SIZE);
  readonly completeVisibleCount = signal(NotesComponent.NOTES_PAGE_SIZE);
  filterQuery = signal('');
  addDialogVisible = signal(false);
  dueQuickVisible = signal(false);
  newNoteText = '';
  newNoteDue = '';
  private clearSearchOnSubmit = false;

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
      closeFlippedOrEditor: (options) => this.closeFlippedOrEditor(options),
      closeEditor: (noteId, options) => this.closeEditor(noteId, options),
      saveEditorHtml: (noteId) => this.saveEditorHtml(noteId),
      hasOpenEditor: () => this.openEditors.size > 0,
      openEditorIds: () => [...this.openEditors],
      isEditorOpen: (noteId) => this.openEditors.has(noteId),
      focusFilter: () => this.focusFilter(),
      renameFocusedCard: () => this.renameFocusedCard(),
      loadMoreAfter: (noteId) => this.loadMoreAfter(noteId),
    });
  }

  ngOnDestroy(): void {
    this.keyboardBridge.unregister();
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

    this.pendingVisibleCount.set(Math.max(this.pendingVisibleCount(), pendingIndex + 1));
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
      if (Number.isFinite(id)) this.flipped.delete(id);
      this.cdr.detectChanges();
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

  async saveEditorHtml(noteId: number): Promise<void> {
    const editor = document.querySelector(
      `.noteEditorArea[data-note-id="${CSS.escape(String(noteId))}"]`
    );
    if (!(editor instanceof HTMLElement)) return;
    this.repo.updateNotesHtml(noteId, editorContentToMarkdown(editor));
    await this.dbService.persist();
    await this.obsidian.pushNoteById(noteId);
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
    this.pendingVisibleCount.set(NotesComponent.NOTES_PAGE_SIZE);
    this.completeVisibleCount.set(NotesComponent.NOTES_PAGE_SIZE);
  }

  pendingNotes(): Note[] {
    return this.notes().filter((n) => n.status === 'pending');
  }

  completeNotes(): Note[] {
    return this.notes().filter((n) => n.status === 'complete');
  }

  visiblePendingNotes(): Note[] {
    return this.pendingNotes().slice(0, this.pendingVisibleCount());
  }

  visibleCompleteNotes(): Note[] {
    return this.completeNotes().slice(0, this.completeVisibleCount());
  }

  hasMorePending(): boolean {
    return this.pendingVisibleCount() < this.pendingNotes().length;
  }

  hasMoreComplete(): boolean {
    return this.completeVisibleCount() < this.completeNotes().length;
  }

  onListScroll(status: 'pending' | 'complete', event: Event): void {
    const list = event.currentTarget;
    if (!(list instanceof HTMLElement)) return;
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (remaining <= 120) this.loadMore(status);
  }

  private loadMore(status: 'pending' | 'complete'): boolean {
    const visibleCount = status === 'pending' ? this.pendingVisibleCount : this.completeVisibleCount;
    const total = status === 'pending' ? this.pendingNotes().length : this.completeNotes().length;
    if (visibleCount() >= total) return false;
    visibleCount.update((count) => Math.min(count + NotesComponent.NOTES_PAGE_SIZE, total));
    return true;
  }

  private loadMoreAfter(noteId: number): boolean {
    const note = this.notes().find((item) => item.id === noteId);
    if (!note) return false;
    const status = note.status;
    const notes = status === 'pending' ? this.pendingNotes() : this.completeNotes();
    const visibleCount = status === 'pending' ? this.pendingVisibleCount() : this.completeVisibleCount();
    const index = notes.findIndex((item) => item.id === noteId);
    const nextId = notes[index + 1]?.id;
    if (index !== visibleCount - 1 || !nextId || !this.loadMore(status)) return false;

    afterNextRender(() => {
      const listId = status === 'pending' ? 'pendingList' : 'completeList';
      const nextCard = document
        .getElementById(listId)
        ?.querySelector<HTMLElement>(`.noteCard[data-note-id="${CSS.escape(String(nextId))}"]`);
      if (nextCard) focusCardPrimaryAction(nextCard);
    }, { injector: this.injector });
    return true;
  }

  setBoard(board: string): void {
    this.state.setActiveBoard(board);
    this.refresh();
  }

  pendingCountForBoard(board: string): number {
    return this.pendingCountsByBoard().get(board) ?? 0;
  }

  boardTabAriaLabel(board: string): string {
    const count = this.pendingCountForBoard(board);
    return `${board}, ${count} pending task${count === 1 ? '' : 's'}`;
  }

  openAddDialog(prefill = ''): void {
    this.newNoteText = prefill;
    this.newNoteDue = '';
    this.dueQuickVisible.set(false);
    this.addDialogVisible.set(true);
    afterNextRender(() => this.scheduleAddDialogFocus(), { injector: this.injector });
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

  onDueDateFocus(): void {
    this.dueQuickVisible.set(true);
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
    if (this.clearSearchOnSubmit) {
      this.filterQuery.set('');
      this.clearSearchOnSubmit = false;
    }
    this.refresh();
  }

  async toggleComplete(note: Note): Promise<void> {
    this.repo.setStatus(note.id, note.status === 'pending' ? 'complete' : 'pending');
    await this.dbService.persist();
    await this.obsidian.pushNoteById(note.id);
    this.refresh();
  }

  async cyclePriority(note: Note): Promise<void> {
    this.repo.togglePriority(note.id);
    await this.dbService.persist();
    this.refresh();
  }

  confirmDelete(note: Note): void {
    if (!window.confirm(`Delete "${note.text.slice(0, 40)}"?`)) return;
    void this.deleteNote(note);
  }

  private async deleteNote(note: Note): Promise<void> {
    this.repo.deleteNote(note.id);
    await this.dbService.persist();
    this.refresh();
  }

  async move(note: Note, dir: 'up' | 'down'): Promise<void> {
    this.repo.reorderPending(note.id, note.board, dir);
    await this.dbService.persist();
    this.refresh();
  }

  flipped = new Set<number>();
  openEditors = new Set<number>();

  toggleFlip(noteId: number): void {
    if (this.flipped.has(noteId)) this.flipped.delete(noteId);
    else this.flipped.add(noteId);
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
    await this.obsidian.syncBeforeEditorOpen(note.id);
    this.refresh();
    this.openEditors.add(note.id);
    this.cdr.detectChanges();
    afterNextRender(() => this.scheduleNotesEditorFocus(note.id), { injector: this.injector });
  }

  async openInObsidian(note: Note): Promise<void> {
    await this.obsidian.openNote(note.id);
  }

  obsidianConfigured(): boolean {
    return this.obsidian.isConfigured();
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

  async deleteLink(linkId: number): Promise<void> {
    this.repo.deleteLink(linkId);
    await this.dbService.persist();
    this.refresh();
  }

  formatDue = formatDueDate;
  formatPriority = formatPriorityLabel;
  nextPriority = nextPriority;
}
