import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppStateService } from '../../core/services/app-state.service';
import { ChromeStorageService } from '../../core/services/chrome-storage.service';
import { DatabaseService } from '../../core/services/database.service';
import { ExportService } from '../../core/services/export.service';
import { BackgroundBridgeService } from '../../core/services/background-bridge.service';
import { NotesRepository } from '../../core/services/notes.repository';
import { PriorityRibbonService } from '../../core/services/priority-ribbon.service';
import { THEME_ORDER, ThemeId } from '../../core/models/envelope.model';
import {
  DEFAULT_PRIORITY_RIBBON_LIMIT,
  PRIORITY_RIBBON_LIMITS,
  PriorityRibbonLimit,
} from '../../core/models/priority-ribbon.model';
import { readPriorityRibbonSettings } from '../../core/utils/ai-settings.util';
import { POPUP_SIZE_DIMENSIONS, POPUP_SIZE_ORDER, PopupSizeId } from '../../core/models/popup-size.model';
import { ThemeSelectKeyboardDirective } from '../../core/keyboard/theme-select-keyboard.directive';
import { ArmedSelectKeyboardDirective } from '../../core/keyboard/armed-select-keyboard.directive';
import { modKeyLabel, type KeyboardNavPlatform } from '../../core/keyboard/keyboard.model';
import {
  HEADER_TITLE_FONT_LABELS,
  HEADER_TITLE_FONT_ORDER,
  headerTitleFontLabel,
  INTERFACE_FONT_LABELS,
  INTERFACE_FONT_ORDER,
  type HeaderTitleFontKey,
  type InterfaceFontKey,
} from '../../core/models/appearance-font.model';
import {
  SettingsKeyboardBridge,
  type SettingsTabId,
} from '../../core/keyboard/settings-keyboard-bridge.service';

type SettingsTab = 'boards' | 'appearance' | 'data' | 'ai' | 'obsidian' | 'keyboard';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ThemeSelectKeyboardDirective, ArmedSelectKeyboardDirective],
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements OnInit, OnDestroy {
  private static readonly DEFAULT_OBSIDIAN_NOTES_FOLDER = 'ToDo';
  private readonly state = inject(AppStateService);
  private readonly storage = inject(ChromeStorageService);
  private readonly dbService = inject(DatabaseService);
  private readonly exportSvc = inject(ExportService);
  private readonly bg = inject(BackgroundBridgeService);
  private readonly repo = inject(NotesRepository);
  private readonly ribbon = inject(PriorityRibbonService);
  private readonly settingsKeyboard = inject(SettingsKeyboardBridge);

  readonly themeOptions = THEME_ORDER;
  readonly priorityRibbonLimitOptions = PRIORITY_RIBBON_LIMITS;
  readonly popupSizeOptions = POPUP_SIZE_ORDER.map((id) => ({
    id,
    label: POPUP_SIZE_DIMENSIONS[id].label,
  }));
  readonly interfaceFontOptions = INTERFACE_FONT_ORDER;
  readonly interfaceFontLabels = INTERFACE_FONT_LABELS;
  readonly headerTitleFontOptions = HEADER_TITLE_FONT_ORDER;
  readonly headerTitleFontLabels = HEADER_TITLE_FONT_LABELS;
  readonly headerTitleFontLabelFn = (value: string): string =>
    headerTitleFontLabel(value as HeaderTitleFontKey);
  headerTitleInput = '';
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
  aiPriorityRibbon = signal(false);
  aiPriorityRibbonLimit = signal<PriorityRibbonLimit>(DEFAULT_PRIORITY_RIBBON_LIMIT);

  obsVault = signal('');
  obsFolder = signal('');
  obsSync = signal(false);

  newBoardName = '';
  private vaultChannel: BroadcastChannel | null = null;

  ngOnInit(): void {
    this.loadPersistedSettings();
    this.refreshBoards();
    this.listenForVaultSelection();
    void this.restoreVaultSelection();
    this.settingsKeyboard.register({
      selectTab: (tab) => this.selectTab(tab),
      activeTab: () => this.activeTab(),
    });
  }

  ngOnDestroy(): void {
    this.settingsKeyboard.unregister();
    this.vaultChannel?.close();
    this.vaultChannel = null;
  }

  private loadPersistedSettings(): void {
    const env = this.storage.getEnvelope();
    this.aiUrl.set(this.dbService.getSetting('ai.endpointBaseUrl') ?? env.ai?.u ?? '');
    this.aiModel.set(this.dbService.getSetting('ai.endpointModel') ?? env.ai?.m ?? '');
    this.aiWords.set(this.customWordsFromSetting(this.dbService.getSetting('ai.customWordsJson'), env.ai?.w ?? ''));

    const ribbon = readPriorityRibbonSettings((key) => this.dbService.getSetting(key), env.ai);
    this.aiPriorityRibbon.set(ribbon.enabled);
    this.aiPriorityRibbonLimit.set(ribbon.limit);

    this.obsVault.set(this.dbService.getSetting('obsidian.vaultName') ?? env.obs?.v ?? '');
    this.obsFolder.set(this.dbService.getSetting('obsidian.notesFolder') ?? env.obs?.f ?? '');
    this.obsSync.set((this.dbService.getSetting('obsidian.syncMode') ?? String(!!env.obs?.s)) === '1');
    this.headerTitleInput = this.state.headerTitleRaw();
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

  onInterfaceFontChange(font: InterfaceFontKey): void {
    this.state.setInterfaceFont(font);
  }

  onHeaderTitleInput(value: string): void {
    this.state.previewHeaderTitle(value);
  }

  onHeaderTitleBlur(): void {
    this.state.setHeaderTitle(this.headerTitleInput);
    this.headerTitleInput = this.state.headerTitleRaw();
  }

  onHeaderTitleFontChange(font: string): void {
    this.state.setHeaderTitleFont(font as HeaderTitleFontKey);
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
    const env = this.storage.getEnvelope();
    this.storage.patch({
      ai: {
        ...env.ai,
        u: this.aiUrl(),
        m: this.aiModel(),
        w: this.aiWords(),
        pr: this.aiPriorityRibbon(),
        prl: this.aiPriorityRibbonLimit(),
      },
    });
    this.dbService.setSetting('ai.endpointBaseUrl', this.aiUrl());
    this.dbService.setSetting('ai.endpointModel', this.aiModel());
    this.dbService.setSetting('ai.customWordsJson', JSON.stringify(words));
    this.ribbon.saveSettings(this.aiPriorityRibbon(), this.aiPriorityRibbonLimit());
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
    await this.storage.flush();
    this.stateRef.reloadDatabaseSettings();
    this.loadPersistedSettings();
    this.ribbon.loadSettings();
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

  private listenForVaultSelection(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    this.vaultChannel = new BroadcastChannel('vim-todo-obsidian-vault');
    this.vaultChannel.onmessage = (event) => {
      if (event.data?.type !== 'linked') return;
      this.applyVaultSelection(event.data?.folderName);
    };
  }

  private async restoreVaultSelection(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get('obsidianVaultFolderSelection_v1');
      this.applyVaultSelection(stored['obsidianVaultFolderSelection_v1']);
    } catch {
      // The folder picker can still update this page through BroadcastChannel.
    }
  }

  private applyVaultSelection(folderName: unknown): void {
    const vaultName = typeof folderName === 'string' ? folderName.trim() : '';
    if (!vaultName) return;

    this.obsVault.set(vaultName);
    if (!this.obsFolder().trim()) this.obsFolder.set(SettingsComponent.DEFAULT_OBSIDIAN_NOTES_FOLDER);
    this.obsSync.set(true);
    this.saveObsidian();
  }

  readonly stateRef = this.state;
}
