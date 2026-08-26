import { Injectable } from '@angular/core';
import type { KeyboardLayout, KeyboardNavPlatform } from '../keyboard/keyboard.model';
import {
  defaultKeyboardNavPlatform,
  getFocusNewNoteKey,
  getNavKeys,
  getNotesCheckboxKey,
  modKeyActive,
  modKeyLabel,
} from '../keyboard/keyboard.model';

/** Key map helpers — navigation is handled by KeyboardNavigationService. */
@Injectable({ providedIn: 'root' })
export class KeyboardService {
  private layout: KeyboardLayout = 'qwerty';
  private platform: KeyboardNavPlatform = defaultKeyboardNavPlatform();

  setLayout(layout: KeyboardLayout): void {
    this.layout = layout;
  }

  setPlatform(platform: KeyboardNavPlatform): void {
    this.platform = platform;
  }

  getLayout(): KeyboardLayout {
    return this.layout;
  }

  getPlatform(): KeyboardNavPlatform {
    return this.platform;
  }

  navKeys = () => getNavKeys(this.layout);
  focusNewNoteKey = () => getFocusNewNoteKey(this.layout);
  checkboxKey = () => getNotesCheckboxKey(this.layout);
  modLabel = () => modKeyLabel(this.platform);
  isModKey = (e: KeyboardEvent) => modKeyActive(e, this.platform);
}
