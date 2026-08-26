import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppStateService } from '../../core/services/app-state.service';
import { ChromeStorageService } from '../../core/services/chrome-storage.service';
import { DatabaseService } from '../../core/services/database.service';
import { ExportService } from '../../core/services/export.service';
import { BackgroundBridgeService } from '../../core/services/background-bridge.service';
import { NotesRepository } from '../../core/services/notes.repository';
import { THEME_ORDER, ThemeId } from '../../core/models/envelope.model';
import { POPUP_SIZE_DIMENSIONS, POPUP_SIZE_ORDER, PopupSizeId } from '../../core/models/popup-size.model';
import { modKeyLabel, type KeyboardNavPlatform } from '../../core/keyboard/keyboard.model';

type SettingsTab = 'boards' | 'appearance' | 'data' | 'ai' | 'obsidian' | 'keyboard';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements OnInit {
  private readonly state = inject(AppStateService);
  private readonly storage = inject(ChromeStorageService);
  private readonly dbService = inject(DatabaseService);
  private readonly exportSvc = inject(ExportService);
  private readonly bg = inject(BackgroundBridgeService);
  private readonly repo = inject(NotesRepository);

  readonly themeOptions = THEME_ORDER;
  readonly popupSizeOptions = POPUP_SIZE_ORDER.map((id) => ({
    id,
    label: POPUP_SIZE_DIMENSIONS[id].label,
  }));
  readonly layoutOptions = [
    { label: 'QWERTY', value: 'qwerty' as const },
    { label: 'Dvorak', value: 'dvorak' as const },
  ];
  readonly tabs: { id: SettingsTab; label: string }[] = [
    { id: 'boards', label: 'Boards' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'data', label: 'Data' },
    { id: 'ai', label: 'AI' },
    { id: 'obsidian', label: 'Obsidian' },
    { id: 'keyboard', label: 'Keyboard' },
  ];

  activeTab = signal<SettingsTab>('boards');
  readonly boards = signal<string[]>([]);

  aiUrl = signal('');
  aiModel = signal('');
  aiWords = signal('');
  aiStatus = signal('');

  obsVault = signal('');
  obsFolder = signal('');
  obsSync = signal(false);

  newBoardName = '';

  ngOnInit(): void {
    this.loadPersistedSettings();
    this.refreshBoards();
  }

  private loadPersistedSettings(): void {
    const env = this.storage.getEnvelope();
    this.aiUrl.set(this.dbService.getSetting('ai.endpointBaseUrl') ?? env.ai?.u ?? '');
    this.aiModel.set(this.dbService.getSetting('ai.endpointModel') ?? env.ai?.m ?? '');
    this.aiWords.set(this.customWordsFromSetting(this.dbService.getSetting('ai.customWordsJson'), env.ai?.w ?? ''));
    this.obsVault.set(this.dbService.getSetting('obsidian.vaultName') ?? env.obs?.v ?? '');
    this.obsFolder.set(this.dbService.getSetting('obsidian.notesFolder') ?? env.obs?.f ?? '');
    this.obsSync.set((this.dbService.getSetting('obsidian.syncMode') ?? String(!!env.obs?.s)) === '1');
  }

  selectTab(tab: SettingsTab): void {
    this.activeTab.set(tab);
    if (tab === 'boards') this.refreshBoards();
  }

  onThemeChange(theme: ThemeId): void {
    this.state.setTheme(theme);
  }

  onPopupSizeChange(size: PopupSizeId): void {
    this.state.setPopupSize(size);
  }

  onLayoutChange(layout: 'qwerty' | 'dvorak'): void {
    this.state.setKeyLayout(layout);
  }

  onNavPlatformChange(platform: KeyboardNavPlatform): void {
    this.state.setKeyboardNavPlatform(platform);
  }

  modLabel(): string {
    return modKeyLabel(this.stateRef.keyboardNavPlatform());
  }

  saveAi(): void {
    const words = this.aiWords()
      .split(/\r?\n/)
      .map((word) => word.trim())
      .filter(Boolean);
    this.storage.patch({
      ai: { u: this.aiUrl(), m: this.aiModel(), w: this.aiWords() },
    });
    this.dbService.setSetting('ai.endpointBaseUrl', this.aiUrl());
    this.dbService.setSetting('ai.endpointModel', this.aiModel());
    this.dbService.setSetting('ai.customWordsJson', JSON.stringify(words));
    void this.storage.flush();
    void this.dbService.persist();
    void this.probeAi();
  }

  saveObsidian(): void {
    this.storage.patch({
      obs: { v: this.obsVault(), f: this.obsFolder(), s: this.obsSync() },
    });
    this.dbService.setSetting('obsidian.vaultName', this.obsVault());
    this.dbService.setSetting('obsidian.notesFolder', this.obsFolder());
    this.dbService.setSetting('obsidian.syncMode', this.obsSync() ? '1' : '0');
    void this.storage.flush();
    void this.dbService.persist();
  }

  async probeAi(): Promise<void> {
    const url = this.aiUrl().trim();
    if (!url) {
      this.aiStatus.set('No endpoint configured');
      return;
    }
    const res = await this.bg.probeOllama(url, this.aiModel());
    this.aiStatus.set(res.ok ? `Connected (${res.model})` : `Error: ${res.error}`);
  }

  exportDb(): void {
    this.exportSvc.exportDbFile();
  }

  exportCsv(): void {
    this.exportSvc.exportCsv(this.dbService.getDb());
  }

  openImportPicker(): void {
    document.getElementById('importDbFile')?.click();
  }

  async importDb(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    await this.dbService.importBytes(new Uint8Array(buf));
    this.stateRef.reloadDatabaseSettings();
    this.loadPersistedSettings();
    this.refreshBoards();
    input.value = '';
  }

  private customWordsFromSetting(value: string | null, fallback: string): string {
    if (!value) return fallback;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((word): word is string => typeof word === 'string').join('\n') : fallback;
    } catch {
      return fallback;
    }
  }

  addBoard(): void {
    if (!this.newBoardName.trim()) return;
    if (!this.repo.addBoard(this.newBoardName.trim())) return;
    void this.dbService.persist();
    this.refreshBoards();
    this.newBoardName = '';
  }

  moveBoard(board: string, direction: 'up' | 'down'): void {
    if (!this.repo.moveBoard(board, direction)) return;
    void this.dbService.persist();
    this.refreshBoards();
  }

  removeBoard(board: string): void {
    if (this.boards().length <= 1) return;
    if (!window.confirm(`Remove "${board}" and all tasks in it?`)) return;
    this.repo.deleteBoard(board);
    this.refreshBoards();
    if (this.state.activeBoard() === board) {
      const nextBoard = this.boards()[0];
      if (nextBoard) this.state.setActiveBoard(nextBoard);
    }
    void this.storage.flush();
    void this.dbService.persist();
  }

  private refreshBoards(): void {
    this.boards.set(this.repo.queryBoards());
  }

  chooseVaultFolder(): void {
    chrome.tabs.create({ url: chrome.runtime.getURL('pick-vault.html') });
  }

  readonly stateRef = this.state;
}
