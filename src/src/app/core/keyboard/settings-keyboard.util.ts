import type { getNavKeys } from './keyboard.model';
import type { SettingsKeyboardBridgeHandler, SettingsTabId } from './settings-keyboard-bridge.service';
import { isVisible, safeFocus } from './keyboard-focus.util';

const SETTINGS_TAB_IDS = new Set<SettingsTabId>([
  'boards',
  'appearance',
  'data',
  'ai',
  'obsidian',
  'keyboard',
]);

const PANEL_FOCUSABLE =
  'button:not([disabled]), a[href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function isInSettingsView(el: Element | null): boolean {
  if (!(el instanceof Element)) return false;
  if (el.closest('.headerLinks') || el.id === 'settingsBtn') return false;
  return !!el.closest('#settingsView');
}

export function getSettingsCloseButton(): HTMLElement | null {
  const btn = document.querySelector<HTMLElement>(
    '#settingsView .instructionsHeader .monoLinkButton, [aria-label="Settings"] .instructionsHeader .monoLinkButton'
  );
  return btn instanceof HTMLElement && isVisible(btn) ? btn : null;
}

export function getSettingsTabTargets(): HTMLElement[] {
  const tablist = document.querySelector('.settingsTablist');
  if (!(tablist instanceof HTMLElement)) return [];
  return [...tablist.querySelectorAll<HTMLElement>('.settingsTab[data-settings-tab]')].filter(isVisible);
}

export function getSettingsSelectedTab(): HTMLElement | null {
  const tabs = getSettingsTabTargets();
  return tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0] ?? null;
}

export function getSettingsPanelFocusables(): HTMLElement[] {
  const panel = document.querySelector('.settingsPanels .settingsPanel[role="tabpanel"]');
  if (!(panel instanceof HTMLElement) || !isVisible(panel)) return [];
  return [...panel.querySelectorAll<HTMLElement>(PANEL_FOCUSABLE)].filter(isVisible);
}

export function focusSettingsPanelControl(target: HTMLElement | null | undefined): boolean {
  if (!(target instanceof HTMLElement) || !safeFocus(target)) return false;
  try {
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } catch {
    /* ignore */
  }
  return true;
}

export function focusSettingsTabEntry(): boolean {
  const tab = getSettingsSelectedTab() ?? getSettingsTabTargets()[0];
  return tab ? safeFocus(tab) : false;
}

function tabIdFromElement(el: HTMLElement): SettingsTabId | null {
  const id = el.getAttribute('data-settings-tab');
  return id && SETTINGS_TAB_IDS.has(id as SettingsTabId) ? (id as SettingsTabId) : null;
}

function activateSettingsTab(tabEl: HTMLElement, bridge: SettingsKeyboardBridgeHandler | null): void {
  const tabId = tabIdFromElement(tabEl);
  if (tabId && bridge) bridge.selectTab(tabId);
}

function isBoardsPanelActive(): boolean {
  const panel = document.querySelector('.settingsPanelBoards[role="tabpanel"]');
  return panel instanceof HTMLElement && isVisible(panel);
}

function getManageTabsRows(): HTMLElement[] {
  const list = document.querySelector('.settingsPanelBoards .manageTabsList');
  if (!(list instanceof HTMLElement)) return [];
  return [...list.querySelectorAll<HTMLElement>('.manageTabsRow')].filter(isVisible);
}

function getManageTabsButtonsInRow(row: HTMLElement): HTMLButtonElement[] {
  return [...row.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.disabled && isVisible(b));
}

function moveFocusWithinManageTabsRow(delta: number): boolean {
  const activeEl = document.activeElement;
  if (!(activeEl instanceof Element)) return false;
  const row = activeEl.closest('.manageTabsRow');
  if (!(row instanceof HTMLElement)) return false;
  const btns = getManageTabsButtonsInRow(row);
  if (!btns.length) return false;
  const activeBtn = activeEl.closest('button');
  const idx = activeBtn instanceof HTMLButtonElement ? btns.indexOf(activeBtn) : -1;
  const nextIdx =
    idx === -1 ? (delta < 0 ? btns.length - 1 : 0) : Math.min(btns.length - 1, Math.max(0, idx + delta));
  return safeFocus(btns[nextIdx]);
}

function moveFocusAcrossManageTabsRows(deltaRows: number): boolean {
  const rows = getManageTabsRows();
  if (!rows.length) return false;
  const activeEl = document.activeElement;
  const currentRow = activeEl instanceof Element ? activeEl.closest('.manageTabsRow') : null;
  const currentIdx = currentRow instanceof HTMLElement ? rows.indexOf(currentRow) : -1;
  if (currentIdx === -1) return false;

  if (currentIdx === 0 && deltaRows < 0) {
    const addBtn = document.querySelector<HTMLElement>('.manageTabsAdd button[type="submit"]');
    const addName = document.querySelector<HTMLElement>('.manageTabsAdd input');
    if (addBtn && safeFocus(addBtn)) return true;
    if (addName && safeFocus(addName)) return true;
    const closeBtn = getSettingsCloseButton();
    return closeBtn ? safeFocus(closeBtn) : false;
  }

  const nextIdx = Math.min(rows.length - 1, Math.max(0, currentIdx + deltaRows));
  const btns = getManageTabsButtonsInRow(rows[nextIdx]);
  const target = btns.find((b) => !b.disabled) ?? btns[0];
  return target ? safeFocus(target) : false;
}

function moveBoardsAddFormFocus(key: string, nav: ReturnType<typeof getNavKeys>): boolean {
  if (!isBoardsPanelActive()) return false;
  const activeEl = document.activeElement;
  if (!(activeEl instanceof Element)) return false;

  const addName = document.querySelector<HTMLElement>('.manageTabsAdd input');
  const addSubmit = document.querySelector<HTMLElement>('.manageTabsAdd button[type="submit"]');
  const inAddForm =
    activeEl === addName || activeEl === addSubmit || !!activeEl.closest('.manageTabsAdd');

  if (!inAddForm || activeEl.closest('.manageTabsRow')) return false;

  const closeBtn = getSettingsCloseButton();
  const rows = getManageTabsRows();

  if (key === nav.up) {
    if (activeEl === addSubmit && closeBtn) return safeFocus(closeBtn);
    if (activeEl === addName && addSubmit) return safeFocus(addSubmit);
    return true;
  }
  if (key === nav.left) {
    if (activeEl === addSubmit && addName) return safeFocus(addName);
    return activeEl !== addName;
  }
  if (key === nav.right) {
    if (activeEl === addName && addSubmit) return safeFocus(addSubmit);
    return true;
  }
  if (key === nav.down) {
    if (rows[0]) {
      const btns = getManageTabsButtonsInRow(rows[0]);
      if (btns[0]) return safeFocus(btns[0]);
    }
    return true;
  }
  return false;
}

function resolveSettingsToggleInput(el: Element): HTMLInputElement | null {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    return el;
  }
  const label =
    el instanceof HTMLLabelElement
      ? el
      : el.closest('label.keyLayoutRadioLabel, label.appearanceSizeRadioLabel');
  if (!(label instanceof HTMLLabelElement)) return null;
  const input = label.querySelector('input[type="checkbox"], input[type="radio"]');
  return input instanceof HTMLInputElement ? input : null;
}

/** Activate focused settings checkbox/radio on Enter (legacy parity; Space works natively). */
export function handleSettingsEnterActivate(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey) return false;
  const activeEl = document.activeElement;
  if (!(activeEl instanceof Element) || !isInSettingsView(activeEl)) return false;

  const input = resolveSettingsToggleInput(activeEl);
  if (!input || input.disabled) return false;

  e.preventDefault();
  e.stopPropagation();
  input.click();
  return true;
}

function movePopupSizeFocus(delta: number): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement) || active.name !== 'popupSizeChoice') return false;
  const inputs = [...document.querySelectorAll<HTMLInputElement>('input[name="popupSizeChoice"]')].filter(
    (input) => !input.disabled && isVisible(input)
  );
  const index = inputs.indexOf(active);
  if (index < 0) return false;
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= inputs.length) return false;
  return focusSettingsPanelControl(inputs[nextIndex]);
}

export function handleSettingsKeyboardNav(
  key: string,
  nav: ReturnType<typeof getNavKeys>,
  activeEl: Element | null,
  bridge: SettingsKeyboardBridgeHandler | null
): boolean {
  if (!(activeEl instanceof Element) || !isInSettingsView(activeEl)) return false;

  if (isBoardsPanelActive() && activeEl.closest('.manageTabsRow')) {
    if (key === nav.left && moveFocusWithinManageTabsRow(-1)) return true;
    if (key === nav.right && moveFocusWithinManageTabsRow(1)) return true;
    if (key === nav.up && moveFocusAcrossManageTabsRows(-1)) return true;
    if (key === nav.down && moveFocusAcrossManageTabsRows(1)) return true;
  }

  if (moveBoardsAddFormFocus(key, nav)) return true;

  if ((key === nav.left || key === nav.right) && movePopupSizeFocus(key === nav.right ? 1 : -1)) {
    return true;
  }

  const tabs = getSettingsTabTargets();
  const tablist = document.querySelector('.settingsTablist');
  const inTablist = tablist instanceof HTMLElement && tablist.contains(activeEl);
  const panelFocusables = getSettingsPanelFocusables();
  const panelIndex = activeEl instanceof HTMLElement ? panelFocusables.indexOf(activeEl) : -1;
  const closeBtn = getSettingsCloseButton();
  const onClose = activeEl === closeBtn;

  if (key === nav.left || key === nav.right) {
    if (key === nav.left) {
      if (!inTablist && (onClose || panelIndex >= 0)) {
        const sel = getSettingsSelectedTab();
        if (sel) safeFocus(sel);
      }
      return true;
    }

    if (inTablist || onClose) {
      const first = panelFocusables[0];
      if (first) focusSettingsPanelControl(first);
      return true;
    }
    if (panelIndex >= 0 && panelIndex < panelFocusables.length - 1) {
      focusSettingsPanelControl(panelFocusables[panelIndex + 1]);
      return true;
    }
    if (panelIndex >= 0 && panelIndex === panelFocusables.length - 1 && closeBtn) {
      safeFocus(closeBtn);
    }
    return true;
  }

  if (key === nav.up || key === nav.down) {
    if (key === nav.down) {
      if (inTablist && activeEl instanceof HTMLElement) {
        const idx = tabs.indexOf(activeEl);
        const nextIdx = idx >= 0 && idx < tabs.length - 1 ? idx + 1 : 0;
        const nextTab = tabs[nextIdx];
        if (nextTab) {
          activateSettingsTab(nextTab, bridge);
          safeFocus(nextTab);
        }
        return true;
      }
      if (panelIndex >= 0 && panelIndex < panelFocusables.length - 1) {
        focusSettingsPanelControl(panelFocusables[panelIndex + 1]);
        return true;
      }
      if (panelIndex >= 0 && panelIndex === panelFocusables.length - 1 && closeBtn) {
        safeFocus(closeBtn);
        return true;
      }
      if (onClose) {
        const firstTab = tabs[0];
        if (firstTab) {
          activateSettingsTab(firstTab, bridge);
          safeFocus(firstTab);
          return true;
        }
        if (panelFocusables[0]) {
          focusSettingsPanelControl(panelFocusables[0]);
          return true;
        }
      }
      return true;
    }

    if (inTablist && activeEl instanceof HTMLElement) {
      const idx = tabs.indexOf(activeEl);
      if (idx === 0 && closeBtn) {
        safeFocus(closeBtn);
        return true;
      }
      const nextIdx = idx <= 0 ? tabs.length - 1 : idx - 1;
      const nextTab = tabs[nextIdx];
      if (nextTab) {
        activateSettingsTab(nextTab, bridge);
        safeFocus(nextTab);
      }
      return true;
    }
    if (panelIndex > 0) {
      focusSettingsPanelControl(panelFocusables[panelIndex - 1]);
      return true;
    }
    if (panelIndex === 0) {
      const sel = getSettingsSelectedTab();
      if (sel) safeFocus(sel);
      return true;
    }
    if (onClose) {
      const gear = document.getElementById('settingsBtn');
      if (gear instanceof HTMLElement && safeFocus(gear)) return true;
      if (panelFocusables.length) safeFocus(panelFocusables[panelFocusables.length - 1]);
      return true;
    }
    return true;
  }

  return false;
}
