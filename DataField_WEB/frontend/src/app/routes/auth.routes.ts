import { Routes } from '@angular/router';
import { guestGuard } from '../core/guards/auth.guard';

export const AUTH_ROUTES: Routes = [
  {
    path: 'change-password',
    loadComponent: () => import('../features/auth/change-password.component').then((m) => m.ChangePasswordComponent),
    title: 'routes.changePassword',
  },
  {
    path: 'microsoft',
    loadComponent: () => import('../features/auth/microsoft-callback.component').then((m) => m.MicrosoftCallbackComponent),
    title: 'routes.microsoft',
  },
  {
    path: 'activar',
    loadComponent: () => import('../features/auth/activate-account.component').then((m) => m.ActivateAccountComponent),
    title: 'routes.activate',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('../features/auth/login/login.component').then((m) => m.LoginComponent),
    canActivate: [guestGuard],
    title: 'routes.login',
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];
