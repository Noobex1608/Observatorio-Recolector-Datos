import { Routes } from '@angular/router';
import { guestGuard } from '../core/guards/auth.guard';

export const AUTH_ROUTES: Routes = [
  {
    path: 'change-password',
    loadComponent: () => import('../features/auth/change-password.component').then((m) => m.ChangePasswordComponent),
    title: 'Cambiar contraseña',
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
