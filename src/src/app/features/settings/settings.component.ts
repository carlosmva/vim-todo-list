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
import { readObsidianSyncEnabled } from '../../core/utils/obsidian-markdown.util';
import { boardDirectoryPath } from '../../core/utils/obsidian-vault-scan.util';
import { ObsidianService, type VaultCompareResult } from '../../core/services/obsidian.service';
import { GuidedTourService } from '../../core/services/guided-tour.service';
import { THEME_LABELS, THEME_ORDER, ThemeId } from '../../core/models/envelope.model';
import {
  DEFAULT_PRIORITY_RIBBON_LIMIT,
  PRIORITY_RIBBON_LIMITS,
  PriorityRibbonLimit,
} from '../../core/models/priority-ribbon.model';
import {
  AI_ENDPOINT_BASE_URL_KEY,
  DEFAULT_OLLAMA_ENDPOINT,
  readPriorityRibbonSettings,
  resolveOllamaEndpoint,
} from '../../core/utils/ai-settings.util';
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
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      min-height: 0;
      width: 100%;
      overflow: hidden;
    }
  `],
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
  private readonly obsidian = inject(ObsidianService);
  private readonly tour = inject(GuidedTourService);
  private readonly settingsKeyboard = inject(SettingsKeyboardBridge);

  readonly themeOptions = THEME_ORDER;
  readonly themeLabels = THEME_LABELS;
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
  readonly defaultOllamaEndpoint = DEFAULT_OLLAMA_ENDPOINT;
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
  obsCacheStatus = signal('');
  vaultLinkedName = signal('');
  vaultCompare = signal<VaultCompareResult | null>(null);
  vaultCompareError = signal('');
  vaultImportStatus = signal('');

  newBoardName = '';
  private vaultChannel: BroadcastChannel | null = null;

  ngOnInit(): void {
    this.loadPersistedSettings();
    this.refreshBoards();
    this.listenForVaultSelection();
    void this.restoreVaultSelection();
    void this.obsidian.preloadVaultRoot();
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
    this.aiUrl.set(resolveOllamaEndpoint(this.dbService.getSetting(AI_ENDPOINT_BASE_URL_KEY), env.ai?.u));
    this.aiModel.set(this.dbService.getSetting('ai.endpointModel') ?? env.ai?.m ?? '');
    this.aiWords.set(this.customWordsFromSetting(this.dbService.getSetting('ai.customWordsJson'), env.ai?.w ?? ''));

    const ribbon = readPriorityRibbonSettings((key) => this.dbService.getSetting(key), env.ai);
    this.aiPriorityRibbon.set(ribbon.enabled);
    this.aiPriorityRibbonLimit.set(ribbon.limit);

    this.obsVault.set(this.dbService.getSetting('obsidian.vaultName') ?? env.obs?.v ?? '');
    this.obsFolder.set(this.dbService.getSetting('obsidian.notesFolder') ?? env.obs?.f ?? '');
    this.obsSync.set(readObsidianSyncEnabled(this.dbService.getSetting('obsidian.syncMode'), env.obs?.s));
    this.headerTitleInput = this.state.headerTitleRaw();
  }

  selectTab(tab: SettingsTab): void {
    this.activeTab.set(tab);
    if (tab === 'boards') this.refreshBoards();
  }

  startTour(): void {
    void this.tour.start();
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
    this.dbService.setSetting(AI_ENDPOINT_BASE_URL_KEY, this.aiUrl());
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

  async removeBoard(board: string): Promise<void> {
    if (this.boards().length <= 1) return;
    const vaultNote =
      this.obsSync() && this.vaultLinkedName()
        ? ` The vault folder ${boardDirectoryPath(this.obsFolder().trim() || 'ToDo', board)} and its Markdown files will also be deleted.`
        : '';
    if (!window.confirm(`Remove "${board}" and all tasks in it?${vaultNote}`)) return;
    const notes = this.repo.queryNotes(board);
    if (this.obsSync()) {
      await this.obsidian.ensureVaultAccess();
      const vaultResult = await this.obsidian.deleteBoardFolder(board);
      if (vaultResult.kind === 'error') this.obsCacheStatus.set(vaultResult.message);
    }
    for (const note of notes) await this.obsidian.forgetFilePath(note.id);
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

  grantVaultAccess(): void {
    this.obsidian.openGrantAccessPage();
  }

  private listenForVaultSelection(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    this.vaultChannel = new BroadcastChannel('vim-todo-obsidian-vault');
    this.vaultChannel.onmessage = (event) => {
      if (event.data?.type === 'linked') {
        this.applyVaultSelection(event.data?.folderName);
        void this.obsidian.reloadVaultRoot();
        this.obsCacheStatus.set(
          'Vault folder linked. Next: Allow folder access. Chrome asks again for this window, on the same vault root — not the ToDo notes folder.'
        );
        return;
      }
      if (event.data?.type === 'permission-granted') {
        void this.obsidian.reloadVaultRoot();
        this.vaultCompareError.set('');
        this.obsCacheStatus.set('Folder access granted. Compare vault and Open in Obsidian can use the vault now.');
      }
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

    this.vaultLinkedName.set(vaultName);

    this.obsVault.set(vaultName);
    if (!this.obsFolder().trim()) this.obsFolder.set(SettingsComponent.DEFAULT_OBSIDIAN_NOTES_FOLDER);
    this.obsSync.set(true);
    this.saveObsidian();
  }

  async clearObsidianCache(): Promise<void> {
    await this.obsidian.clearPathCaches();
    this.obsCacheStatus.set('Cleared remembered vault paths and first-open cache. The next sync can recreate or remap files.');
  }

  canCompareVault(): boolean {
    return this.obsSync() && !!this.vaultLinkedName().trim();
  }

  async compareVault(): Promise<void> {
    this.vaultCompareError.set('');
    this.vaultImportStatus.set('');
    this.vaultCompare.set(null);
    const result = await this.obsidian.compareVaultNotes();
    if (result.kind === 'error') {
      this.vaultCompareError.set(result.message);
      if (result.code === 'permission-denied') this.obsidian.openGrantAccessPage();
      return;
    }
    this.vaultCompare.set(result.compare);
  }

  cancelVaultImport(): void {
    this.vaultCompare.set(null);
  }

  async confirmVaultImport(): Promise<void> {
    const compare = this.vaultCompare();
    if (!compare) return;
    const result = await this.obsidian.importMissingVaultNotes(compare);
    if (result.kind === 'error') {
      this.vaultCompareError.set(result.message);
      return;
    }
    this.vaultCompare.set(null);
    this.vaultImportStatus.set(
      `Imported ${result.imported}. Already in database ${result.skipped}. Ignored ${result.ignored}.`
    );
    this.refreshBoards();
    this.stateRef.reloadDatabaseSettings();
  }

  readonly stateRef = this.state;
}
