import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/notes/notes.component').then((m) => m.NotesComponent) },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'calendar',
    loadComponent: () => import('./features/calendar/calendar.component').then((m) => m.CalendarComponent),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'instructions',
    loadComponent: () =>
      import('./features/instructions/instructions.component').then((m) => m.InstructionsComponent),
  },
  {
    path: 'about',
    loadComponent: () => import('./features/about/about.component').then((m) => m.AboutComponent),
  },
  { path: '**', redirectTo: '' },
];
