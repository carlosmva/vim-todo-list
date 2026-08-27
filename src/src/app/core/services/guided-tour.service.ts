import { ApplicationRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppStateService } from './app-state.service';
import { DatabaseService } from './database.service';
import { SettingsKeyboardBridge } from '../keyboard/settings-keyboard-bridge.service';
import { safeFocus } from '../keyboard/keyboard-focus.util';
import {
  GUIDED_TOUR_SEEN_KEY,
  GUIDED_TOUR_STEPS,
  computeSpotlightRect,
  computeTourPanelPosition,
  cycleTourFocusables,
  guidedTourKeyAction,
  spotlightRadiusFromBorderRadius,
  type SpotlightRect,
} from '../utils/guided-tour.util';

export interface GuidedTourPanelLayout {
  left: number;
  top: number;
  anchored: boolean;
}

@Injectable({ providedIn: 'root' })
export class GuidedTourService {
  private readonly router = inject(Router);
  private readonly appRef = inject(ApplicationRef);
  private readonly state = inject(AppStateService);
  private readonly db = inject(DatabaseService);
  private readonly settings = inject(SettingsKeyboardBridge);

  readonly active = signal(false);
  readonly index = signal(0);
  readonly hasTarget = signal(false);
  readonly spotlight = signal<SpotlightRect>({ x: 0, y: 0, width: 0, height: 0, radius: 8 });
  readonly panel = signal<GuidedTourPanelLayout | null>(null);

  readonly step = computed(() => GUIDED_TOUR_STEPS[this.index()] ?? null);
  readonly stepCount = GUIDED_TOUR_STEPS.length;
  readonly progressLabel = computed(() => `Step ${this.index() + 1} of ${this.stepCount}`);
  readonly isFirst = computed(() => this.index() === 0);
  readonly isLast = computed(() => this.index() >= this.stepCount - 1);
  readonly nextLabel = computed(() => (this.isLast() ? 'Done' : 'Next'));

  private keysAttached = false;
  private firstOpenScheduled = false;
  private lastFocus: HTMLElement | null = null;
  private targetEl: HTMLElement | null = null;
  private renderToken = 0;

  attachKeys(): void {
    if (this.keysAttached || typeof document === 'undefined') return;
    this.keysAttached = true;
    document.addEventListener('keydown', this.onDocumentKeydown, true);
  }

  scheduleFirstOpen(): void {
    if (this.firstOpenScheduled) return;
    this.firstOpenScheduled = true;
    if (this.hasSeenTour()) return;
    window.setTimeout(() => {
      if (!this.active()) void this.start({ markSeen: true });
    }, 120);
  }

  hasSeenTour(): boolean {
    return this.db.getSetting(GUIDED_TOUR_SEEN_KEY) === '1';
  }

  async start(options: { markSeen?: boolean } = {}): Promise<void> {
    this.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.active.set(true);
    this.index.set(0);
    this.clearTarget();
    if (options.markSeen !== false) this.markSeen();
    this.bindViewportListeners();
    await this.renderCurrentStep();
  }

  async next(): Promise<void> {
    if (!this.active()) return;
    if (this.isLast()) {
      await this.close({ restoreFocus: true });
      return;
    }
    this.index.update((value) => value + 1);
    await this.renderCurrentStep();
  }

  async back(): Promise<void> {
    if (!this.active() || this.isFirst()) return;
    this.index.update((value) => Math.max(0, value - 1));
    await this.renderCurrentStep();
  }

  async close(options: { restoreFocus?: boolean } = {}): Promise<void> {
    const restoreFocus = options.restoreFocus !== false;
    this.renderToken += 1;
    this.active.set(false);
    this.unbindViewportListeners();
    this.clearTarget();
    this.panel.set(null);
    await this.router.navigateByUrl('/');
    this.appRef.tick();

    let restored = false;
    if (restoreFocus && this.lastFocus && document.contains(this.lastFocus)) {
      restored = safeFocus(this.lastFocus);
    }
    if (!restored) {
      safeFocus(document.getElementById('addNoteButton'));
    }
    this.lastFocus = null;
  }

  updateSpotlight(): void {
    if (!this.active() || !(this.targetEl instanceof HTMLElement)) return;
    const overlay = document.getElementById('guidedTour');
    const panelEl = overlay?.querySelector('.guidedTour__panel');
    const rect = this.targetEl.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth || document.documentElement.clientWidth || 0,
      height: window.innerHeight || document.documentElement.clientHeight || 0,
    };
    const box = computeSpotlightRect(rect, viewport);
    const radius = spotlightRadiusFromBorderRadius(parseFloat(getComputedStyle(this.targetEl).borderTopLeftRadius || '0'));
    this.spotlight.set({ ...box, radius });
    this.hasTarget.set(true);

    if (panelEl instanceof HTMLElement) {
      const panelRect = panelEl.getBoundingClientRect();
      const pos = computeTourPanelPosition(
        { left: box.x, top: box.y, width: box.width, height: box.height },
        { width: panelRect.width, height: panelRect.height },
        viewport
      );
      this.panel.set({ ...pos, anchored: true });
    }
  }

  private markSeen(): void {
    this.db.setSetting(GUIDED_TOUR_SEEN_KEY, '1');
    void this.db.persist();
  }

  private async renderCurrentStep(): Promise<void> {
    const token = ++this.renderToken;
    const step = this.step();
    if (!step || !this.active()) return;

    this.clearTarget();
    this.panel.set(null);
    this.hasTarget.set(false);

    const path = step.view === 'settings' ? '/settings' : '/';
    if ((this.router.url.split('?')[0] || '/') !== path) {
      await this.router.navigateByUrl(path);
    }
    this.appRef.tick();

    if (step.view === 'settings' && step.section) {
      await this.waitForSettings();
      if (token !== this.renderToken) return;
      this.settings.get()?.selectTab(step.section);
      this.appRef.tick();
    }

    await this.waitFrames(2);
    if (token !== this.renderToken || !this.active()) return;

    const target = await this.waitForSelector(step.target);
    if (token !== this.renderToken || !this.active()) return;
    if (target) {
      try {
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
      } catch {
        // ignore
      }
      await this.waitFrames(1);
      if (token !== this.renderToken || !this.active()) return;
      this.targetEl = target;
      target.classList.add('guidedTourTarget');
      this.updateSpotlight();
    }

    safeFocus(document.getElementById('guidedTourNext'));
  }

  private async waitForSettings(): Promise<void> {
    for (let i = 0; i < 20; i++) {
      if (this.settings.get() && document.getElementById('settingsView')) return;
      await this.waitFrames(1);
      this.appRef.tick();
    }
  }

  private async waitForSelector(selector: string): Promise<HTMLElement | null> {
    for (let i = 0; i < 24; i++) {
      const el = document.querySelector(selector);
      if (el instanceof HTMLElement) return el;
      await this.waitFrames(1);
      this.appRef.tick();
    }
    return null;
  }

  private waitFrames(count: number): Promise<void> {
    return new Promise((resolve) => {
      const step = (left: number): void => {
        if (left <= 0) {
          resolve();
          return;
        }
        requestAnimationFrame(() => step(left - 1));
      };
      step(count);
    });
  }

  private clearTarget(): void {
    this.targetEl?.classList.remove('guidedTourTarget');
    this.targetEl = null;
    this.hasTarget.set(false);
  }

  private bindViewportListeners(): void {
    window.addEventListener('resize', this.onViewportChange);
    document.addEventListener('scroll', this.onViewportChange, true);
  }

  private unbindViewportListeners(): void {
    window.removeEventListener('resize', this.onViewportChange);
    document.removeEventListener('scroll', this.onViewportChange, true);
  }

  private onViewportChange = (): void => {
    if (this.active()) this.updateSpotlight();
  };

  private onDocumentKeydown = (event: KeyboardEvent): void => {
    if (!this.active()) return;
    const action = guidedTourKeyAction(event, this.state.keyLayout(), this.state.keyboardNavPlatform());
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (action.type === 'close') {
      void this.close({ restoreFocus: true });
      return;
    }
    if (action.type === 'next') {
      void this.next();
      return;
    }
    if (action.type === 'back') {
      void this.back();
      return;
    }
    if (action.type === 'activate') {
      const buttons = this.tourButtons();
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && buttons.includes(active) && !active.disabled) {
        active.click();
        return;
      }
      document.getElementById('guidedTourNext')?.click();
      return;
    }

    const delta =
      action.type === 'cycle' ? action.delta : action.direction === 'right' || action.direction === 'down' ? 1 : -1;
    const next = cycleTourFocusables(this.tourButtons(), delta);
    if (next) safeFocus(next);
  };

  private tourButtons(): HTMLButtonElement[] {
    return [
      document.getElementById('guidedTourSkip'),
      document.getElementById('guidedTourBack'),
      document.getElementById('guidedTourNext'),
    ].filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement);
  }
}
