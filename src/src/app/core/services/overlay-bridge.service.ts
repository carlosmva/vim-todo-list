import { Injectable } from '@angular/core';
import { ThemeId } from '../models/envelope.model';

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
