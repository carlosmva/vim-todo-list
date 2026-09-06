import { Injectable } from '@angular/core';
import type { NavKeys, KeyboardNavPlatform } from './keyboard.model';
import { modKeyOnly } from './keyboard.model';

export interface ArmedSelectHandlers {
  getOrder: () => readonly string[];
  getValue: () => string;
  onCommit: (value: string) => void;
  labelFor: (value: string) => string;
  subject: string;
}

interface ArmedSelectRegistration extends ArmedSelectHandlers {
  armed: boolean;
  changeAllowed: boolean;
}

const NATIVE_SELECT_NAV_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

@Injectable({ providedIn: 'root' })
export class ThemeSelectKeyboardService {
  private readonly registrations = new Map<HTMLSelectElement, ArmedSelectRegistration>();

  register(select: HTMLSelectElement, handlers: ArmedSelectHandlers): void {
    const reg: ArmedSelectRegistration = {
      getOrder: handlers.getOrder,
      getValue: handlers.getValue,
      onCommit: handlers.onCommit,
      labelFor: handlers.labelFor,
      subject: handlers.subject,
      armed: false,
      changeAllowed: false,
    };
    this.registrations.set(select, reg);
    this.syncSelectValue(select, reg);
    this.updateArmedUi(select, reg);

    select.addEventListener('pointerdown', this.onPointerDown);
    select.addEventListener('blur', this.onBlur);
    select.addEventListener('change', this.onChange, true);
  }

  unregister(select: HTMLSelectElement): void {
    select.removeEventListener('pointerdown', this.onPointerDown);
    select.removeEventListener('blur', this.onBlur);
    select.removeEventListener('change', this.onChange, true);
    this.registrations.delete(select);
  }

  handleCaptureKeyDown(
    e: KeyboardEvent,
    nav: NavKeys,
    platform: KeyboardNavPlatform
  ): boolean {
    const select = this.getFocusedSelect();
    if (!select) return false;

    const reg = this.registrations.get(select);
    if (!reg) return false;

    if (modKeyOnly(e, platform)) {
      const key = (e.key || '').toLowerCase();
      if (reg.armed && (key === nav.up || key === nav.down)) {
        e.preventDefault();
        e.stopPropagation();
        this.cycleSelect(select, key === nav.down ? 1 : -1);
        return true;
      }
      return false;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    const raw = e.key;
    const code = e.code || '';
    const isEnter = raw === 'Enter' || code === 'Enter' || raw === ' ';
    const isEscape = raw === 'Escape' || code === 'Escape';

    if (isEnter) {
      e.preventDefault();
      e.stopPropagation();
      this.setArmed(select, true);
      return true;
    }
    if (isEscape) {
      e.preventDefault();
      e.stopPropagation();
      this.setArmed(select, false);
      return true;
    }
    if (reg.armed && raw.length === 1 && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      this.jumpSelect(select, raw);
      return true;
    }
    if (NATIVE_SELECT_NAV_KEYS.has(raw) || raw.length === 1) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    return false;
  }

  disarmFocused(): boolean {
    const select = this.getFocusedSelect();
    if (!select) return false;
    const reg = this.registrations.get(select);
    if (!reg?.armed) return false;
    this.setArmed(select, false);
    return true;
  }

  refreshSelect(select: HTMLSelectElement): void {
    const reg = this.registrations.get(select);
    if (!reg) return;
    this.syncSelectValue(select, reg);
    this.updateArmedUi(select, reg);
  }

  private readonly onPointerDown = (e: Event): void => {
    const select = e.currentTarget;
    if (!(select instanceof HTMLSelectElement)) return;
    const reg = this.registrations.get(select);
    if (!reg) return;
    reg.changeAllowed = true;
    this.setArmed(select, false);
  };

  private readonly onBlur = (e: Event): void => {
    const select = e.currentTarget;
    if (!(select instanceof HTMLSelectElement)) return;
    const reg = this.registrations.get(select);
    if (!reg) return;
    reg.changeAllowed = false;
    this.setArmed(select, false);
  };

  private readonly onChange = (e: Event): void => {
    const select = e.currentTarget;
    if (!(select instanceof HTMLSelectElement)) return;
    const reg = this.registrations.get(select);
    if (!reg) return;

    if (!reg.changeAllowed) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.syncSelectValue(select, reg);
      this.updateArmedUi(select, reg);
      return;
    }

    const value = select.value;
    reg.changeAllowed = false;
    if (!reg.getOrder().includes(value)) {
      this.syncSelectValue(select, reg);
      return;
    }
    reg.onCommit(value);
    this.updateArmedUi(select, reg);
  };

  private getFocusedSelect(): HTMLSelectElement | null {
    const active = document.activeElement;
    if (active instanceof HTMLSelectElement && this.registrations.has(active)) {
      return active;
    }
    return null;
  }

  private setArmed(select: HTMLSelectElement, armed: boolean): void {
    const reg = this.registrations.get(select);
    if (!reg) return;
    reg.armed = armed;
    this.updateArmedUi(select, reg);
  }

  private syncSelectValue(select: HTMLSelectElement, reg: ArmedSelectRegistration): void {
    const value = reg.getValue();
    if (select.value !== value) {
      select.value = value;
    }
  }

  private cycleSelect(select: HTMLSelectElement, delta: number): void {
    const reg = this.registrations.get(select);
    if (!reg?.armed) return;

    const order = reg.getOrder();
    if (!order.length) return;
    let idx = order.indexOf(select.value);
    if (idx < 0) idx = 0;
    idx = (idx + delta + order.length) % order.length;

    reg.changeAllowed = true;
    select.value = order[idx];
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private jumpSelect(select: HTMLSelectElement, letter: string): void {
    const reg = this.registrations.get(select);
    if (!reg?.armed) return;
    const order = reg.getOrder();
    if (!order.length) return;
    const needle = letter.toLowerCase();
    const current = Math.max(0, order.indexOf(select.value));
    for (let step = 1; step <= order.length; step += 1) {
      const value = order[(current + step) % order.length];
      const label = reg.labelFor(value);
      if (label.toLowerCase().startsWith(needle)) {
        reg.changeAllowed = true;
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
  }

  private updateArmedUi(select: HTMLSelectElement, reg: ArmedSelectRegistration): void {
    select.dataset['armed'] = reg.armed ? 'true' : 'false';
    const label = reg.labelFor(reg.getValue());
    const subject = reg.subject;
    select.title = reg.armed
      ? `${subject}: ${label}. Use navigation up/down to change. Press Escape to exit.`
      : `${subject}: ${label}. Click to open options, or press Enter to change with keyboard.`;
    select.setAttribute(
      'aria-label',
      reg.armed
        ? `${subject} change mode. Current: ${label}. Use navigation up and down to change. Press Escape to exit.`
        : `${subject}: ${label}. Click to open options, or press Enter to change with keyboard. Press Escape to exit change mode.`
    );
  }
}
