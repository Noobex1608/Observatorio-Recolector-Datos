import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Guard que protege rutas que requieren autenticación.
 * Verifica si el usuario tiene un token válido y opcionalmente valida con el backend.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Si no hay token, redirigir a login
  if (!authService.isAuthenticated()) {
    void router.navigate(['/auth/login']);
    return false;
  }

  // Si ya tenemos el usuario en memoria, permitir acceso
  if (authService.user()) {
    if (authService.user()?.must_change_password) return router.createUrlTree(['/auth/change-password']);
    return true;
  }

  // Si hay token pero no usuario, validar con el backend
  return authService.checkAuth().pipe(
    map((isValid) => {
      if (!isValid) {
        void router.navigate(['/auth/login']);
        return false;
      }
      if (authService.user()?.must_change_password) return router.createUrlTree(['/auth/change-password']);
      return true;
    }),
    catchError(() => {
      void router.navigate(['/auth/login']);
      return of(false);
    }),
  );
};

/**
 * Guard que protege rutas públicas.
 * Redirige al panel de formularios si el usuario ya está autenticado.
 */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return true;
  }

  void router.navigate([authService.user()?.must_change_password ? '/auth/change-password' : '/admin/dashboard']);
  return false;
};
