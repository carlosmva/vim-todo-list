import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStateService } from '../../core/services/app-state.service';
import { BackgroundBridgeService } from '../../core/services/background-bridge.service';
import { ChromeStorageService } from '../../core/services/chrome-storage.service';
import { DatabaseService } from '../../core/services/database.service';
import { ExportService } from '../../core/services/export.service';
import { GuidedTourService } from '../../core/services/guided-tour.service';
import { NotesRepository } from '../../core/services/notes.repository';
import { ObsidianService } from '../../core/services/obsidian.service';
import { PriorityRibbonService } from '../../core/services/priority-ribbon.service';
import { SettingsKeyboardBridge } from '../../core/keyboard/settings-keyboard-bridge.service';
import { SettingsComponent } from './settings.component';

describe('SettingsComponent Obsidian compare', () => {
  const compareVaultNotes = vi.fn();
  const importMissingVaultNotes = vi.fn();
  const openGrantAccessPage = vi.fn();

  beforeEach(async () => {
    compareVaultNotes.mockReset();
    importMissingVaultNotes.mockReset();
    openGrantAccessPage.mockReset();
    (globalThis as unknown as { chrome: { storage: { local: { get: () => Promise<Record<string, unknown>> } }; runtime: { getURL: (path: string) => string }; tabs: { create: () => void } } }).chrome = {
      storage: { local: { get: async () => ({}) } },
      runtime: { getURL: (path: string) => path },
      tabs: { create: () => undefined },
    };
    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideRouter([]),
        {
          provide: AppStateService,
          useValue: {
            headerTitleRaw: signal(''),
            reloadDatabaseSettings: () => undefined,
            keyboardNavPlatform: signal('winlinux'),
          },
        },
        { provide: ChromeStorageService, useValue: { getEnvelope: () => ({}), patch: () => undefined, flush: async () => undefined } },
        {
          provide: DatabaseService,
          useValue: {
            getSetting: () => null,
            setSetting: () => undefined,
            persist: async () => undefined,
            getDb: () => ({}),
          },
        },
        { provide: ExportService, useValue: {} },
        { provide: BackgroundBridgeService, useValue: {} },
        { provide: NotesRepository, useValue: { queryBoards: () => ['Work'], addBoard: () => true, queryNotes: () => [] } },
        { provide: PriorityRibbonService, useValue: { loadSettings: () => undefined, saveSettings: () => undefined } },
        {
          provide: ObsidianService,
          useValue: {
            compareVaultNotes,
            importMissingVaultNotes,
            clearPathCaches: async () => undefined,
            preloadVaultRoot: async () => undefined,
            reloadVaultRoot: async () => undefined,
            openGrantAccessPage,
            ensureVaultAccess: async () => true,
            deleteBoardFolder: async () => ({ kind: 'ok' }),
            forgetFilePath: async () => undefined,
          },
        },
        { provide: GuidedTourService, useValue: { start: async () => undefined } },
        { provide: SettingsKeyboardBridge, useValue: { register: () => undefined, unregister: () => undefined } },
      ],
    }).compileComponents();
  });

  function create() {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.componentInstance.selectTab('obsidian');
    fixture.detectChanges();
    return fixture;
  }

  it('hides Compare vault when Sync is off or no folder is linked', () => {
    const fixture = create();
    fixture.componentInstance.obsSync.set(false);
    fixture.componentInstance.vaultLinkedName.set('');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')?.textContent).not.toContain('Compare vault');
    expect(fixture.componentInstance.canCompareVault()).toBe(false);

    fixture.componentInstance.obsSync.set(true);
    fixture.componentInstance.vaultLinkedName.set('Vault');
    fixture.detectChanges();
    const labels = [...fixture.nativeElement.querySelectorAll('button')].map((el: HTMLButtonElement) => el.textContent?.trim());
    expect(labels).toContain('Compare vault');
    expect(labels).toContain('Allow folder access');
  });

  it('explains the two Allows are for the same vault root', () => {
    const fixture = create();
    expect(fixture.nativeElement.textContent).toContain('same vault root');
    expect(fixture.nativeElement.textContent).toContain('Allow folder access');
  });

  it('shows a summary and does not import when Cancel is clicked', async () => {
    compareVaultNotes.mockResolvedValue({
      kind: 'ok',
      compare: {
        missing: [{ id: 42, path: 'ToDo/Work/New.md', markdown: '', title: 'Vault only', board: 'Work', status: 'pending', due_at: null, notes_html: '', updatedAt: 1 }],
        present: [{ id: 7, path: 'ToDo/Work/Title.md', differs: true }],
        ignoredCount: 1,
      },
    });
    const fixture = create();
    fixture.componentInstance.obsSync.set(true);
    fixture.componentInstance.vaultLinkedName.set('Vault');
    await fixture.componentInstance.compareVault();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Missing 1');
    expect(fixture.nativeElement.textContent).toContain('1 differ');
    expect(fixture.nativeElement.textContent).toContain('Vault only');
    fixture.componentInstance.cancelVaultImport();
    fixture.detectChanges();
    expect(importMissingVaultNotes).not.toHaveBeenCalled();
    expect(fixture.componentInstance.vaultCompare()).toBeNull();
  });

  it('surfaces compare errors and does not import', async () => {
    compareVaultNotes.mockResolvedValue({
      kind: 'error',
      code: 'permission-denied',
      message:
        'Chrome needs a second Allow on the same vault folder — not a second folder, and not the ToDo notes folder. Click Allow folder access.',
    });
    const fixture = create();
    await fixture.componentInstance.compareVault();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('second Allow');
    expect(openGrantAccessPage).toHaveBeenCalled();
    expect(importMissingVaultNotes).not.toHaveBeenCalled();
  });

  it('imports missing notes after confirm and shows counts', async () => {
    const compare = {
      missing: [{ id: 42, path: 'ToDo/Work/New.md', markdown: '', title: 'Vault only', board: 'Work', status: 'pending', due_at: null, notes_html: '', updatedAt: 1 }],
      present: [],
      ignoredCount: 0,
    };
    compareVaultNotes.mockResolvedValue({ kind: 'ok', compare });
    importMissingVaultNotes.mockResolvedValue({ kind: 'ok', imported: 1, skipped: 0, ignored: 0 });
    const fixture = create();
    await fixture.componentInstance.compareVault();
    await fixture.componentInstance.confirmVaultImport();
    fixture.detectChanges();
    expect(importMissingVaultNotes).toHaveBeenCalledWith(compare);
    expect(fixture.nativeElement.textContent).toContain('Imported 1');
  });
});
