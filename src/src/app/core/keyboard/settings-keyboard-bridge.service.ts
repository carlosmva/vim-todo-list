import { Injectable } from '@angular/core';

export type SettingsTabId = 'boards' | 'appearance' | 'data' | 'ai' | 'obsidian' | 'keyboard';

export interface SettingsKeyboardBridgeHandler {
  selectTab(tab: SettingsTabId): void;
  activeTab(): SettingsTabId;
}

@Injectable({ providedIn: 'root' })
export class SettingsKeyboardBridge {
  private handler: SettingsKeyboardBridgeHandler | null = null;

  register(handler: SettingsKeyboardBridgeHandler): void {
    this.handler = handler;
  }

  unregister(): void {
    this.handler = null;
  }

  get(): SettingsKeyboardBridgeHandler | null {
    return this.handler;
  }
}
