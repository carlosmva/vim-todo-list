import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { AppStateService } from './core/services/app-state.service';
import { OverlayBridgeService } from './core/services/overlay-bridge.service';
import { THEME_ORDER, ThemeId } from './core/models/envelope.model';

const PRIMARY_VIEW_PATHS = new Set(['/', '/dashboard', '/calendar']);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly state = inject(AppStateService);
  private readonly overlay = inject(OverlayBridgeService);
  private readonly router = inject(Router);

  readonly ready = this.state.ready;
  readonly themeOptions = THEME_ORDER;
  themeModel = computed(() => this.state.theme());

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split('?')[0] || '/'),
      startWith(this.router.url.split('?')[0] || '/')
    ),
    { initialValue: '/' }
  );

  readonly showViewNav = computed(() => PRIMARY_VIEW_PATHS.has(this.url() ?? '/'));

  onThemeChange(theme: ThemeId): void {
    this.state.setTheme(theme);
  }

  closePopup(): void {
    this.overlay.close();
  }
}
