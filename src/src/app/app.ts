import { Component, computed, effect, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { AppStateService } from './core/services/app-state.service';
import { OverlayBridgeService } from './core/services/overlay-bridge.service';
import { PriorityRibbonService } from './core/services/priority-ribbon.service';
import { PriorityRibbonComponent } from './features/priority-ribbon/priority-ribbon.component';
import { ThemeSelectKeyboardDirective } from './core/keyboard/theme-select-keyboard.directive';
import { ObsidianConflictModalComponent } from './features/obsidian-conflict/obsidian-conflict-modal.component';
import { THEME_ORDER, ThemeId } from './core/models/envelope.model';

const PRIMARY_VIEW_PATHS = new Set(['/', '/dashboard', '/calendar']);
const PRIORITY_RIBBON_REFRESH_MS = 30_000;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, FormsModule, PriorityRibbonComponent, ThemeSelectKeyboardDirective, ObsidianConflictModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  private readonly state = inject(AppStateService);
  private readonly overlay = inject(OverlayBridgeService);
  private readonly router = inject(Router);
  private readonly ribbon = inject(PriorityRibbonService);
  private ribbonRefreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly ready = this.state.ready;
  readonly themeOptions = THEME_ORDER;
  themeModel = computed(() => this.state.theme());
  readonly headerTitleDisplay = this.state.headerTitleDisplay;
  readonly ribbonEnabled = this.ribbon.enabled;
  readonly ribbonAtTop = computed(() => {
    const size = this.state.popupSize();
    return size === 'm' || size === 'l';
  });

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split('?')[0] || '/'),
      startWith(this.router.url.split('?')[0] || '/')
    ),
    { initialValue: '/' }
  );

  readonly showViewNav = computed(() => PRIMARY_VIEW_PATHS.has(this.url() ?? '/'));

  constructor() {
    effect(() => {
      if (!this.state.ready()) return;
      this.state.reapplyAppearance();
    });

    effect(() => {
      if (!this.state.ready()) return;
      this.ribbon.loadSettings();
      this.scheduleRibbonRefresh();
    });

    effect(() => {
      if (!this.showViewNav() || !this.ribbon.enabled()) return;
      this.url();
      this.ribbon.refreshItems();
    });
  }

  ngOnDestroy(): void {
    if (this.ribbonRefreshTimer) clearInterval(this.ribbonRefreshTimer);
  }

  private scheduleRibbonRefresh(): void {
    if (this.ribbonRefreshTimer) clearInterval(this.ribbonRefreshTimer);
    this.ribbonRefreshTimer = setInterval(() => {
      if (this.ribbon.enabled()) this.ribbon.refreshItems();
    }, PRIORITY_RIBBON_REFRESH_MS);
  }

  onThemeChange(theme: ThemeId): void {
    this.state.setTheme(theme);
  }

  closePopup(): void {
    this.overlay.close();
  }
}
