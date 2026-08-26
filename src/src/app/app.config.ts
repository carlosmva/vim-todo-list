import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MARKED_OPTIONS, provideMarkdown } from 'ngx-markdown';
import { routes } from './app.routes';
import { provideAppBootstrap } from './core/providers/app-bootstrap.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideMarkdown({
      markedOptions: {
        provide: MARKED_OPTIONS,
        useValue: {
          gfm: true,
          breaks: true,
        },
      },
    }),
    provideAppBootstrap(),
  ],
};
