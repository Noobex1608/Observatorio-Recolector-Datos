import { Routes } from '@angular/router';
import { ShellComponent } from './core/layout/shell/shell.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/routes/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/routes/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
      },
      {
        path: 'users',
        loadChildren: () => import('./features/users/routes/users.routes').then((m) => m.USERS_ROUTES),
      },
      {
        path: 'surveys',
        loadChildren: () => import('./features/surveys/routes/surveys.routes').then((m) => m.SURVEYS_ROUTES),
      },
      {
        path: 'responses',
        loadChildren: () =>
          import('./features/responses/routes/responses.routes').then((m) => m.RESPONSES_ROUTES),
      },
      {
        path: 'reports',
        loadChildren: () => import('./features/reports/routes/reports.routes').then((m) => m.REPORTS_ROUTES),
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
