import { Injectable } from '@angular/core';
import { ThemeId } from '../models/envelope.model';
import {
  headerTitleFontCss,
  headerTitleForDisplay,
  interfaceFontCss,
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
    const family = interfaceFontCss(key);
    this.applyRootVar('--modern-font-sans', family);
    this.applyRootVar('--puppertino-font', family);
    document.documentElement.style.setProperty('font-family', family);
    document.body?.style.setProperty('font-family', family);
    document.documentElement.setAttribute('data-interface-font', key);
    document.body?.setAttribute('data-interface-font', key);
  }

  private applyRootVar(name: string, value: string): void {
    document.documentElement.style.setProperty(name, value);
    document.body?.style.setProperty(name, value);
  }

  setHeaderTitleText(storedRaw: string): void {
    const el = document.getElementById('headerTitle');
    if (el instanceof HTMLElement) {
      el.textContent = headerTitleForDisplay(storedRaw);
    }
  }

  setHeaderTitleFont(key: HeaderTitleFontKey): void {
    const family = key ? headerTitleFontCss(key) : '';
    const roots = [document.documentElement, document.body];
    for (const node of roots) {
      if (!node) continue;
      if (family) {
        node.style.setProperty('--header-title-font-family', family);
        node.setAttribute('data-header-title-font', key);
      } else {
        node.style.removeProperty('--header-title-font-family');
        node.removeAttribute('data-header-title-font');
      }
    }

    const el = document.getElementById('headerTitle');
    if (!(el instanceof HTMLElement)) return;
    if (!family) {
      el.style.removeProperty('font-family');
      return;
    }
    el.style.setProperty('font-family', family);
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
