import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { ADMIN_ROUTES, AUTH_ROUTES } from './routes';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'auth/login',
  },
  {
    path: 'collect/:uuid',
    loadComponent: () =>
      import('./features/forms/collect/form-collect.component').then(
        (m) => m.FormCollectComponent,
      ),
    title: 'routes.collect',
  },
  {
    path: 'auth',
    children: AUTH_ROUTES,
  },
  {
    path: 'perfil',
    loadComponent: () =>
      import('./features/profile/profile.component').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
    title: 'routes.profile',
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./shared/components/layout/main-layout.component').then((m) => m.MainLayoutComponent),
    canActivate: [authGuard],
    children: ADMIN_ROUTES,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
