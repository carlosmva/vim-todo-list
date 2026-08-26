import { Injectable } from '@angular/core';
import { ThemeId } from '../models/envelope.model';
import {
  HEADER_TITLE_FONT_FAMILIES,
  headerTitleForDisplay,
  INTERFACE_FONT_FAMILIES,
  type HeaderTitleFontKey,
  type InterfaceFontKey,
} from '../models/appearance-font.model';

@Injectable({ providedIn: 'root' })
export class OverlayBridgeService {
  setTheme(theme: ThemeId | string): void {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'vim-todo-theme', theme }, '*');
      } catch {
        /* ignore */
      }
    }
  }

  setPopupSize(size: string): void {
    document.documentElement.setAttribute('data-popup-size', size);
    document.body.setAttribute('data-popup-size', size);
    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'vim-todo-popup-size', size }, '*');
      } catch {
        /* ignore */
      }
    }
  }

  setInterfaceFont(key: InterfaceFontKey): void {
    document.documentElement.style.setProperty('--modern-font-sans', INTERFACE_FONT_FAMILIES[key]);
  }

  setHeaderTitleText(storedRaw: string): void {
    const el = document.getElementById('headerTitle');
    if (el instanceof HTMLElement) {
      el.textContent = headerTitleForDisplay(storedRaw);
    }
  }

  setHeaderTitleFont(key: HeaderTitleFontKey): void {
    const root = document.documentElement;
    if (!key) {
      root.style.removeProperty('--header-title-font-family');
    } else {
      root.style.setProperty('--header-title-font-family', HEADER_TITLE_FONT_FAMILIES[key]);
    }

    const el = document.getElementById('headerTitle');
    if (!(el instanceof HTMLElement)) return;
    if (!key) {
      el.style.removeProperty('font-family');
      return;
    }
    el.style.setProperty('font-family', HEADER_TITLE_FONT_FAMILIES[key]);
  }

  close(): void {
    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'vim-todo-close' }, '*');
      } catch {
        /* ignore */
      }
    }
  }
}
