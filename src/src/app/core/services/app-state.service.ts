import { computed, Injectable, signal } from '@angular/core';
import { ChromeStorageService } from './chrome-storage.service';
import { DatabaseService } from './database.service';
import { OverlayBridgeService } from './overlay-bridge.service';
import { DEFAULT_BOARD, DEFAULT_THEME, ThemeId, THEME_ORDER } from '../models/envelope.model';
import { POPUP_SIZE_ORDER, PopupSizeId } from '../models/popup-size.model';
import { defaultKeyboardNavPlatform, type KeyboardNavPlatform } from '../keyboard/keyboard.model';
import {
  headerTitleForDisplay,
  normalizeHeaderTitleInput,
  normalizeHeaderTitleFontKey,
  normalizeInterfaceFontKey,
  resolveHeaderTitleFont,
  resolveInterfaceFont,
  type HeaderTitleFontKey,
  type InterfaceFontKey,
} from '../models/appearance-font.model';

@Injectable({ providedIn: 'root' })
export class AppStateService {
  readonly theme = signal<ThemeId>(DEFAULT_THEME as ThemeId);
  readonly activeBoard = signal(DEFAULT_BOARD);
  readonly keyLayout = signal<'qwerty' | 'dvorak'>('qwerty');
  readonly keyboardNavPlatform = signal<KeyboardNavPlatform>(defaultKeyboardNavPlatform());
  readonly popupSize = signal<PopupSizeId>('m');
  readonly headerTitleRaw = signal('');
  readonly headerTitleFont = signal<HeaderTitleFontKey>('plus-jakarta');
  readonly interfaceFont = signal<InterfaceFontKey>('plus-jakarta');
  readonly headerTitleDisplay = computed(() => headerTitleForDisplay(this.headerTitleRaw()));
  readonly ready = signal(false);

  constructor(
    private readonly storage: ChromeStorageService,
    private readonly dbService: DatabaseService,
    private readonly overlay: OverlayBridgeService
  ) {}

  async bootstrap(): Promise<void> {
    const env = await this.storage.init();
    await this.dbService.init();
    this.applyDatabaseSettings(env);
    this.ready.set(true);
  }

  reloadDatabaseSettings(): void {
    this.applyDatabaseSettings(this.storage.getEnvelope());
  }

  private applyDatabaseSettings(env: ReturnType<ChromeStorageService['getEnvelope']>): void {
    const storedTheme = this.dbService.getSetting('app.theme') ?? env.t;
    const theme = (THEME_ORDER.includes(storedTheme as ThemeId) ? storedTheme : DEFAULT_THEME) as ThemeId;
    this.theme.set(theme);
    this.activeBoard.set(env.b || DEFAULT_BOARD);
    this.keyLayout.set(env.kl === 'dvorak' ? 'dvorak' : 'qwerty');
    this.keyboardNavPlatform.set(
      env.knp === 'mac' || env.knp === 'winlinux' ? env.knp : defaultKeyboardNavPlatform()
    );
    const storedPopupSize = this.dbService.getSetting('app.popupSize') ?? env.ps;
    const ps = POPUP_SIZE_ORDER.includes(storedPopupSize as PopupSizeId) ? (storedPopupSize as PopupSizeId) : 'm';
    this.popupSize.set(ps);

    const headerTitleRaw = this.dbService.getSetting('app.headerTitle') ?? '';
    const headerTitleFont = resolveHeaderTitleFont(this.dbService.getSetting('app.headerTitleFont'));
    const interfaceFont = resolveInterfaceFont(this.dbService.getSetting('app.interfaceFont'));

    this.headerTitleRaw.set(normalizeHeaderTitleInput(headerTitleRaw));
    this.headerTitleFont.set(headerTitleFont);
    this.interfaceFont.set(interfaceFont);

    this.storage.patch({ t: theme, ps });
    this.overlay.setTheme(theme);
    this.overlay.setPopupSize(ps);
    this.applyAppearance();
  }

  private applyAppearance(): void {
    this.overlay.setInterfaceFont(this.interfaceFont());
    this.overlay.setHeaderTitleText(this.headerTitleRaw());
    this.overlay.setHeaderTitleFont(this.headerTitleFont());
  }

  reapplyAppearance(): void {
    this.applyAppearance();
  }

  setTheme(theme: ThemeId): void {
    this.theme.set(theme);
    this.storage.patch({ t: theme });
    this.dbService.setSetting('app.theme', theme);
    void this.dbService.persist();
    this.overlay.setTheme(theme);
  }

  setActiveBoard(board: string): void {
    this.activeBoard.set(board);
    this.storage.patch({ b: board });
  }

  setKeyLayout(layout: 'qwerty' | 'dvorak'): void {
    this.keyLayout.set(layout);
    this.storage.patch({ kl: layout });
  }

  setKeyboardNavPlatform(platform: KeyboardNavPlatform): void {
    this.keyboardNavPlatform.set(platform);
    this.storage.patch({ knp: platform });
  }

  setPopupSize(size: PopupSizeId): void {
    this.popupSize.set(size);
    this.storage.patch({ ps: size });
    this.dbService.setSetting('app.popupSize', size);
    void this.dbService.persist();
    this.overlay.setPopupSize(size);
  }

  previewHeaderTitle(raw: string): void {
    this.overlay.setHeaderTitleText(raw);
  }

  setHeaderTitle(raw: string): void {
    const normalized = normalizeHeaderTitleInput(raw);
    this.headerTitleRaw.set(normalized);
    this.dbService.setSetting('app.headerTitle', normalized);
    void this.dbService.persist();
    this.overlay.setHeaderTitleText(normalized);
  }

  setHeaderTitleFont(key: HeaderTitleFontKey): void {
    const normalized = normalizeHeaderTitleFontKey(key);
    this.headerTitleFont.set(normalized);
    this.dbService.setSetting('app.headerTitleFont', normalized);
    void this.dbService.persist();
    this.overlay.setHeaderTitleFont(normalized);
  }

  setInterfaceFont(key: InterfaceFontKey): void {
    const normalized = normalizeInterfaceFontKey(key) || resolveInterfaceFont('');
    this.interfaceFont.set(normalized);
    this.dbService.setSetting('app.interfaceFont', normalized);
    void this.dbService.persist();
    this.overlay.setInterfaceFont(normalized);
  }
}
