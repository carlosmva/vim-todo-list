import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppStateService } from '../services/app-state.service';
import { OverlayBridgeService } from '../services/overlay-bridge.service';
import {
  getFocusNewNoteKey,
  getCompleteColumnKey,
  getNavKeys,
  getNotesCheckboxKey,
  getPendingColumnKey,
  modKeyActive,
  modKeyOnly,
  type KeyboardLayout,
  type KeyboardNavPlatform,
} from './keyboard.model';
import {
  extendSelection,
  getNoteIdFromEditor,
  moveSelection,
  toggleOrInsertLineCheckbox,
} from './notes-vim-editor.util';
import { NotesVimEditorService } from './notes-vim-editor.service';
import {
  focusCardPrimaryAction,
  focusMainBoardSwitcherTab,
  focusNotesSearchRow,
  focusViewContentEntry,
  getActiveViewNavLink,
  getAllCardsInDomOrder,
  getBoardColumnElements,
  getBoardTabElements,
  getCardFromElement,
  getExpandedBoardColumn,
  getFocusedAnchor,
  getHeaderNavTargets,
  getViewNavTargets,
  isOnBoardColumn,
  isOnBoardTabs,
  isTypingTarget,
  isViewNavVisible,
  isVisible,
  moveButtonFocusWithinCard,
  moveCalendarFocus,
  moveCardFocus,
  moveGlobalFocus,
  resolveBoardTabElement,
  resolveHeaderNavElement,
  resolveInternalAppRoute,
  safeFocus,
} from './keyboard-focus.util';
import { NotesKeyboardBridge } from './notes-keyboard-bridge.service';
import { SettingsKeyboardBridge } from './settings-keyboard-bridge.service';
import { ThemeSelectKeyboardService } from './theme-select-keyboard.service';
import { handleLinksPanelModNav, isInLinksPanel } from './note-links-keyboard.util';
import { handleSettingsEnterActivate, handleSettingsKeyboardNav } from './settings-keyboard.util';

@Injectable({ providedIn: 'root' })
export class KeyboardNavigationService {
  private readonly state = inject(AppStateService);
  private readonly router = inject(Router);
  private readonly overlay = inject(OverlayBridgeService);
  private readonly notesBridge = inject(NotesKeyboardBridge);
  private readonly settingsBridge = inject(SettingsKeyboardBridge);
  private readonly themeSelectKeyboard = inject(ThemeSelectKeyboardService);
  private readonly vimEditor = inject(NotesVimEditorService);
  private attached = false;

  attach(): void {
    if (this.attached || typeof document === 'undefined') return;
    this.attached = true;
    document.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('keydown', this.onBoardShortcut, true);
    document.addEventListener('keydown', this.onSlashFilter, true);
    document.addEventListener('keydown', this.onColumnPanelShortcut, true);
    document.addEventListener('keydown', this.onEscape, true);
  }

  detach(): void {
    if (!this.attached) return;
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('keydown', this.onBoardShortcut, true);
    document.removeEventListener('keydown', this.onSlashFilter, true);
    document.removeEventListener('keydown', this.onColumnPanelShortcut, true);
    document.removeEventListener('keydown', this.onEscape, true);
    this.attached = false;
  }

  private layout(): KeyboardLayout {
    return this.state.keyLayout();
  }

  private platform(): KeyboardNavPlatform {
    return this.state.keyboardNavPlatform();
  }

  private onBoardShortcut = (e: KeyboardEvent): void => {
    if (document.getElementById('obsidianConflictModal')) return;
    const key = e.key;
    if (key < '1' || key > '9') return;
    const hasMod = modKeyActive(e, this.platform());
    if (!hasMod && isTypingTarget(document.activeElement)) return;
    const bridge = this.notesBridge.get();
    if (!bridge) return;
    const boards = bridge.boards();
    const board = boards[Number(key) - 1];
    if (!board) return;
    e.preventDefault();
    if (hasMod) this.notesBridge.lastBoardShortcutAt = Date.now();
    bridge.setBoard(board);
  };

  private onSlashFilter = (e: KeyboardEvent): void => {
    if (document.getElementById('obsidianConflictModal')) return;
    if (e.key !== '/' || modKeyActive(e, this.platform()) || e.ctrlKey || e.metaKey) return;
    if (isTypingTarget(document.activeElement)) return;
    const path = this.router.url.split('?')[0];
    if (path !== '/' && path !== '') return;
    const bridge = this.notesBridge.get();
    if (!bridge) return;
    e.preventDefault();
    bridge.focusFilter();
  };

  private onColumnPanelShortcut = (e: KeyboardEvent): void => {
    if (document.getElementById('obsidianConflictModal')) return;
    const layout = this.layout();
    const pendingKey = getPendingColumnKey(layout);
    const completeKey = getCompleteColumnKey(layout);
    const key = (e.key || '').toLowerCase();
    if (key !== pendingKey && key !== completeKey) return;
    if (modKeyActive(e, this.platform()) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(document.activeElement)) return;
    const path = this.router.url.split('?')[0];
    if (path !== '/' && path !== '') return;

    const bridge = this.notesBridge.get();
    if (!bridge) return;
    if (bridge.isAddDialogOpen?.() || bridge.isDeleteDialogOpen?.()) return;
    if (bridge.hasOpenEditor()) return;

    e.preventDefault();
    e.stopPropagation();
    bridge.setBoardColumnSplit(key === pendingKey ? 'pending' : 'complete');
  };

  private onEscape = (e: KeyboardEvent): void => {
    if (document.getElementById('obsidianConflictModal')) return;
    if (e.key !== 'Escape' || modKeyActive(e, this.platform()) || e.ctrlKey || e.metaKey) return;

    if (this.themeSelectKeyboard.disarmFocused()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const bridge = this.notesBridge.get();
    if (bridge?.isDeleteDialogOpen?.()) {
      e.preventDefault();
      e.stopPropagation();
      bridge.closeDeleteDialog();
      return;
    }

    if (bridge?.isAddDialogOpen?.()) {
      e.preventDefault();
      e.stopPropagation();
      bridge.closeAddDialog();
      return;
    }

    const flippedCard = getCardFromElement(document.activeElement);
    if (flippedCard?.classList.contains('is-flipped') && bridge?.closeFlippedOrEditor()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (bridge?.hasOpenEditor()) return;

    const path = this.router.url.split('?')[0];
    if (path !== '/' && path !== '') {
      e.preventDefault();
      void this.router.navigate(['/']);
      setTimeout(() => safeFocus(document.getElementById('addNoteButton')), 0);
      return;
    }

    if (window.parent !== window) {
      e.preventDefault();
      this.overlay.close();
    }
  };

  private colonPending = false;
  private colonTimer: ReturnType<typeof setTimeout> | null = null;

  private onKeyDown = (e: KeyboardEvent): void => {
    if (document.getElementById('obsidianConflictModal')) return;
    // Chrome assigns Alt+Enter on anchors to save/download behavior. Route in-app
    // links through the router and suppress the default for everything else.
    if (e.key === 'Enter' && e.altKey && !e.ctrlKey && !e.metaKey) {
      const anchor = getFocusedAnchor(document.activeElement);
      if (anchor) {
        e.preventDefault();
        e.stopPropagation();
        const route = resolveInternalAppRoute(anchor);
        if (route !== null) void this.router.navigateByUrl(route);
        return;
      }
    }

    if (handleSettingsEnterActivate(e)) {
      return;
    }

    const key = (e.key || '').toLowerCase();
    const nav = getNavKeys(this.layout());
    const platform = this.platform();

    if (this.themeSelectKeyboard.handleCaptureKeyDown(e, nav, platform)) {
      return;
    }

    const bridge = this.notesBridge.get();

    // : then x — close notes editor or flipped links panel.
    if (!e.ctrlKey && !e.metaKey && !modKeyActive(e, platform)) {
      if (key === ':') {
        const ctx =
          document.activeElement instanceof Element &&
          (document.activeElement.closest('.noteEditorArea') ||
            document.activeElement.closest('.noteCard.is-flipped') ||
            getCardFromElement(document.activeElement)?.classList.contains('is-flipped'));
        if (ctx) {
          e.preventDefault();
          this.colonPending = true;
          if (this.colonTimer) clearTimeout(this.colonTimer);
          this.colonTimer = setTimeout(() => {
            this.colonPending = false;
          }, 700);
          return;
        }
      }
      if ((key === 'x' || key === 'q') && this.colonPending) {
        e.preventDefault();
        this.colonPending = false;
        if (this.colonTimer) clearTimeout(this.colonTimer);
        bridge?.closeFlippedOrEditor({ save: key === 'x' });
        return;
      }
    }
    if (
      modKeyActive(e, platform) &&
      (e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') &&
      modKeyOnly(e, platform)
    ) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Prevent bare modifier from opening browser menu.
    if (
      e.key === 'F2' &&
      !e.ctrlKey &&
      !e.metaKey &&
      !modKeyActive(e, platform) &&
      bridge?.renameFocusedCard
    ) {
      const card = getCardFromElement(document.activeElement);
      if (card && !card.classList.contains('is-flipped')) {
        e.preventDefault();
        bridge.renameFocusedCard();
        return;
      }
    }

    if (
      !modKeyActive(e, platform) ||
      (platform === 'mac' ? e.metaKey || e.altKey : e.ctrlKey || e.metaKey)
    ) {
      return;
    }

    if (bridge?.isDeleteDialogOpen?.()) {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        bridge.cycleDeleteDialogFocus(e.shiftKey ? -1 : 1);
        return;
      }

      if (modKeyOnly(e, platform)) {
        const direction =
          key === nav.left ? 'left' : key === nav.right ? 'right' : key === nav.up ? 'up' : key === nav.down ? 'down' : null;
        if (direction) {
          e.preventDefault();
          e.stopPropagation();
          bridge.moveDeleteDialogFocus(direction);
        }
      }
      return;
    }

    if (bridge?.isAddDialogOpen?.()) {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        bridge.cycleAddDialogFocus(e.shiftKey ? -1 : 1);
        return;
      }

      if (modKeyOnly(e, platform)) {
        const direction =
          key === nav.left ? 'left' : key === nav.right ? 'right' : key === nav.up ? 'up' : key === nav.down ? 'down' : null;
        if (direction) {
          e.preventDefault();
          e.stopPropagation();
          bridge.moveAddDialogFocus(direction);
        }
      }
      return;
    }

    const activeEl = document.activeElement;
    const focusNewNoteKey = getFocusNewNoteKey(this.layout());
    if (key === focusNewNoteKey) {
      e.preventDefault();
      e.stopPropagation();
      if (this.router.url.split('?')[0] === '/' || this.router.url.split('?')[0] === '') {
        bridge?.openAddDialog();
      } else {
        void this.router.navigate(['/']).then(() => bridge?.openAddDialog());
      }
      return;
    }

    const checkboxKey = getNotesCheckboxKey(this.layout());
    const inNotesEditor =
      activeEl instanceof Element && !!activeEl.closest('.noteEditorArea');

    if (inNotesEditor && modKeyOnly(e, platform) && key === checkboxKey) {
      const editor = activeEl instanceof Element ? activeEl.closest('.noteEditorArea') : null;
      if (editor instanceof HTMLElement) {
        e.preventDefault();
        e.stopPropagation();
        editor.focus();
        toggleOrInsertLineCheckbox(editor);
        return;
      }
    }

    if (
      inNotesEditor &&
      modKeyOnly(e, platform) &&
      (key === nav.left || key === nav.right || key === nav.up || key === nav.down) &&
      key !== checkboxKey
    ) {
      const noteEditorEl =
        activeEl instanceof Element ? activeEl.closest('.noteEditorArea') : null;
      const noteEditor = noteEditorEl instanceof HTMLElement ? noteEditorEl : null;
      const noteId = noteEditor ? getNoteIdFromEditor(noteEditor) : null;
      const mode = noteId !== null ? this.vimEditor.getMode(noteId) : null;
      if (noteEditor instanceof HTMLElement && mode) {
        e.preventDefault();
        e.stopPropagation();
        noteEditor.focus();
        if (mode === 'visual') {
          if (key === nav.left) extendSelection('backward', 'character');
          else if (key === nav.right) extendSelection('forward', 'character');
          else if (key === nav.up) extendSelection('backward', 'line');
          else if (key === nav.down) extendSelection('forward', 'line');
        } else {
          if (key === nav.left) moveSelection('backward', 'character');
          else if (key === nav.right) moveSelection('forward', 'character');
          else if (key === nav.up) moveSelection('backward', 'line');
          else if (key === nav.down) moveSelection('forward', 'line');
        }
        return;
      }
    }

    if (key !== nav.left && key !== nav.right && key !== nav.up && key !== nav.down) return;

    const inEditor =
      activeEl instanceof Element && activeEl.closest('.noteEditorArea');
    if (inEditor instanceof HTMLElement) {
      const noteId = getNoteIdFromEditor(inEditor);
      if (noteId !== null && this.vimEditor.getMode(noteId) === 'insert') return;
    }

    e.preventDefault();
    e.stopPropagation();

    this.handleModNav(key, nav, activeEl, bridge);
  };

  private handleModNav(
    key: string,
    nav: ReturnType<typeof getNavKeys>,
    activeEl: Element | null,
    bridge: ReturnType<NotesKeyboardBridge['get']>
  ): void {
    const path = this.router.url.split('?')[0] || '/';
    const linksCard =
      activeEl instanceof Element && isInLinksPanel(activeEl) ? getCardFromElement(activeEl) : null;
    if (
      linksCard &&
      (key === nav.left || key === nav.right || key === nav.up || key === nav.down)
    ) {
      if (handleLinksPanelModNav(key, nav, linksCard)) return;
      if (key === nav.up || key === nav.down) {
        const cards = getAllCardsInDomOrder();
        const idx = cards.indexOf(linksCard);
        const firstPending = document.querySelector('#pendingList .noteCard[data-note-id]');
        const firstComplete = document.querySelector('#completeList .noteCard[data-note-id]');
        if (key === nav.up && (linksCard === firstPending || linksCard === firstComplete || idx <= 0)) {
          bridge?.closeCardOverlays(linksCard);
          focusMainBoardSwitcherTab();
          return;
        }
        moveCardFocus(key === nav.down ? 1 : -1, {
          onLeaveCard: (card) => bridge?.closeCardOverlays(card),
          loadMoreAfter: (card) => {
            const noteId = Number(card.dataset['noteId']);
            return Number.isFinite(noteId) && !!bridge?.loadMoreAfter?.(noteId);
          },
          loadMoreBefore: (card) => {
            const noteId = Number(card.dataset['noteId']);
            return Number.isFinite(noteId) && !!bridge?.loadMoreBefore?.(noteId);
          },
        });
        return;
      }
    }

    const headerEl = resolveHeaderNavElement(activeEl);
    const inHeader = headerEl != null;
    const inViewNav =
      activeEl instanceof Element && !!activeEl.closest('.viewNav');

    if (handleSettingsKeyboardNav(key, nav, activeEl, this.settingsBridge.get())) {
      return;
    }

    // Header: left/right horizontal; down → view nav (or content); up no-op.
    if (inHeader && headerEl) {
      if (key === nav.left || key === nav.right) {
        const targets = getHeaderNavTargets();
        const idx = targets.indexOf(headerEl);
        if (idx >= 0) {
          const delta = key === nav.right ? 1 : -1;
          safeFocus(targets[Math.min(targets.length - 1, Math.max(0, idx + delta))]);
        }
        return;
      }
      if (key === nav.down) {
        if (isViewNavVisible()) {
          const link = getActiveViewNavLink();
          if (link) safeFocus(link);
        } else {
          focusViewContentEntry(path, headerEl);
        }
        return;
      }
      if (key === nav.up) {
        return;
      }
    }

    // View nav row (Notes / Dashboard / Calendar): left/right between tabs; down into view; up to header.
    if (inViewNav) {
      const links = getViewNavTargets();
      const idx = activeEl instanceof HTMLElement ? links.indexOf(activeEl) : -1;
      if (key === nav.left || key === nav.right) {
        if (idx >= 0 && links.length) {
          const delta = key === nav.right ? 1 : -1;
          safeFocus(links[(idx + delta + links.length) % links.length]);
        }
        return;
      }
      if (key === nav.down) {
        focusViewContentEntry(path);
        return;
      }
      if (key === nav.up) {
        const settings = document.getElementById('settingsBtn');
        if (settings instanceof HTMLElement) safeFocus(settings);
        else {
          const targets = getHeaderNavTargets();
          if (targets.length) safeFocus(targets[targets.length - 1]);
        }
        return;
      }
    }

    // Filter ↔ add button.
    const filter = document.getElementById('cardFilterInput');
    const addBtn = document.getElementById('addNoteButton');
    if (activeEl === filter && key === nav.right && addBtn) {
      safeFocus(addBtn);
      return;
    }
    if (activeEl === addBtn && key === nav.left && filter) {
      safeFocus(filter);
      return;
    }

    // Board tabs — handle all directions before card/global fallbacks.
    const calendarDay =
      activeEl instanceof HTMLElement && activeEl.classList.contains('calendarDayCell');
    const calendarTask =
      activeEl instanceof HTMLElement && activeEl.classList.contains('calendarTaskLink');
    if (path === '/calendar') {
      if (calendarDay) {
        if (key === nav.up && moveCalendarFocus(-1, 0)) return;
        if (key === nav.down && moveCalendarFocus(1, 0)) return;
        if (key === nav.left && moveCalendarFocus(0, -1)) return;
        if (key === nav.right && moveCalendarFocus(0, 1)) return;
      }

      if (calendarTask) {
        const activeTask = activeEl as HTMLElement;
        const tasks = [...document.querySelectorAll<HTMLElement>('.calendarTaskLink')];
        const taskIndex = tasks.indexOf(activeTask);
        if (key === nav.up) {
          if (taskIndex > 0) {
            safeFocus(tasks[taskIndex - 1]);
            return;
          }
          const selectedDay = document.querySelector<HTMLElement>('.calendarDayCell--selected');
          if (selectedDay) {
            safeFocus(selectedDay);
            return;
          }
        }
        if (key === nav.down && taskIndex >= 0 && taskIndex < tasks.length - 1) {
          safeFocus(tasks[taskIndex + 1]);
          return;
        }
      }
    }

    if (isOnBoardTabs(activeEl)) {
      const tabs = getBoardTabElements();
      const tabEl = resolveBoardTabElement(activeEl);
      const idx = tabEl ? tabs.indexOf(tabEl) : -1;

      if (key === nav.left || key === nav.right) {
        if (idx >= 0 && tabs.length) {
          const delta = key === nav.right ? 1 : -1;
          const next = tabs[(idx + delta + tabs.length) % tabs.length];
          safeFocus(next);
          const boardName = next.getAttribute('data-board');
          if (boardName) bridge?.setBoard(boardName);
        }
        return;
      }
      if (key === nav.up) {
        focusNotesSearchRow();
        return;
      }
      if (key === nav.down) {
        const cards = getAllCardsInDomOrder();
        if (cards.length) {
          focusCardPrimaryAction(cards[0]);
          return;
        }
        const col = getExpandedBoardColumn();
        if (col) safeFocus(col);
        return;
      }
    }

    if (path === '/' || path === '') {
      const { board, pending, complete } = getBoardColumnElements();
      if (
        board &&
        pending &&
        complete &&
        activeEl instanceof HTMLElement &&
        isOnBoardColumn(activeEl)
      ) {
        if (key === nav.left && activeEl === complete) {
          safeFocus(pending);
          return;
        }
        if (key === nav.right && activeEl === pending) {
          safeFocus(complete);
          return;
        }
        if (key === nav.up) {
          focusMainBoardSwitcherTab();
          return;
        }
        if (key === nav.down) {
          const splitPending = board.classList.contains('board--split-pending');
          const splitComplete = board.classList.contains('board--split-complete');
          if (splitPending && activeEl === pending) {
            const first = document.querySelector('#pendingList .noteCard');
            if (first instanceof HTMLElement) {
              focusCardPrimaryAction(first);
              return;
            }
            return;
          }
          if (splitComplete && activeEl === complete) {
            const first = document.querySelector('#completeList .noteCard');
            if (first instanceof HTMLElement) {
              focusCardPrimaryAction(first);
              return;
            }
            return;
          }
          if (splitPending && activeEl === complete) {
            bridge?.setBoardColumnSplit('complete');
            requestAnimationFrame(() => {
              const first = document.querySelector('#completeList .noteCard');
              if (first instanceof HTMLElement) focusCardPrimaryAction(first);
            });
            return;
          }
          if (splitComplete && activeEl === pending) {
            bridge?.setBoardColumnSplit('pending');
            requestAnimationFrame(() => {
              const first = document.querySelector('#pendingList .noteCard');
              if (first instanceof HTMLElement) focusCardPrimaryAction(first);
            });
            return;
          }
        }
      }
    }

    // Card action buttons left/right.
    const card = getCardFromElement(activeEl);
    if (card && (key === nav.left || key === nav.right)) {
      const buttons = card.querySelector('.noteActions');
      if (buttons?.contains(activeEl as Node)) {
        moveButtonFocusWithinCard(card, key === nav.right ? 1 : -1);
        return;
      }
    }

    // Up/down between cards and vertical regions.
    if (key === nav.up || key === nav.down) {
      if (key === nav.up) {
        if (activeEl === filter) {
          if (isViewNavVisible()) {
            const link = getActiveViewNavLink();
            if (link && safeFocus(link)) return;
          }
          const targets = getHeaderNavTargets();
          if (targets[0]) {
            safeFocus(targets[0]);
            return;
          }
        }
        if (activeEl === addBtn) {
          const settingsBtn = document.getElementById('settingsBtn');
          if (settingsBtn instanceof HTMLElement) {
            safeFocus(settingsBtn);
            return;
          }
        }
      }

      if (this.notesBridge.lastBoardShortcutAt) {
        const age = Date.now() - this.notesBridge.lastBoardShortcutAt;
        if (age >= 0 && age <= 1500) {
          this.notesBridge.lastBoardShortcutAt = 0;
          const cards = getAllCardsInDomOrder();
          if (cards.length) {
            focusCardPrimaryAction(cards[0]);
            return;
          }
        }
      }

      const onCard = getCardFromElement(activeEl);
      if (onCard) {
        if (key === nav.up) {
          const noteId = Number(onCard.dataset['noteId']);
          if (Number.isFinite(noteId) && this.notesBridge.get()?.loadMoreBefore?.(noteId)) return;

          const cards = getAllCardsInDomOrder();
          const idx = cards.indexOf(onCard);
          const firstPending = document.querySelector('#pendingList .noteCard[data-note-id]');
          const firstComplete = document.querySelector('#completeList .noteCard[data-note-id]');
          if (onCard === firstPending || onCard === firstComplete || idx <= 0) {
            this.notesBridge.get()?.closeCardOverlays(onCard);
            focusMainBoardSwitcherTab();
            return;
          }
        }
        if (key === nav.down) {
          const noteId = Number(onCard.dataset['noteId']);
          if (Number.isFinite(noteId) && this.notesBridge.get()?.loadMoreAfter?.(noteId)) return;
        }
        moveCardFocus(key === nav.down ? 1 : -1, {
          onLeaveCard: (card) => this.notesBridge.get()?.closeCardOverlays(card),
          loadMoreAfter: (card) => {
            const noteId = Number(card.dataset['noteId']);
            return Number.isFinite(noteId) && !!this.notesBridge.get()?.loadMoreAfter?.(noteId);
          },
          loadMoreBefore: (card) => {
            const noteId = Number(card.dataset['noteId']);
            return Number.isFinite(noteId) && !!this.notesBridge.get()?.loadMoreBefore?.(noteId);
          },
        });
        return;
      }

      if (key === nav.down && activeEl === filter) {
        const tab = document.querySelector<HTMLElement>('#boardTabs [role="tab"][aria-selected="true"]');
        if (tab && safeFocus(tab)) return;
      }

      moveGlobalFocus(key === nav.down ? 1 : -1);
      return;
    }

    // Left/right global when not on card actions.
    if (key === nav.left || key === nav.right) {
      if (card) {
        moveButtonFocusWithinCard(card, key === nav.right ? 1 : -1);
        return;
      }
      moveGlobalFocus(key === nav.right ? 1 : -1);
    }
  };
}
