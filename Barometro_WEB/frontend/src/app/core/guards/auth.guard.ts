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
    router.navigate(['/auth/login']);
    return false;
  }

  // Si ya tenemos el usuario en memoria, permitir acceso
  if (authService.user()) {
    return true;
  }

  // Si hay token pero no usuario, validar con el backend
  return authService.checkAuth().pipe(
    map((isValid) => {
      if (!isValid) {
        router.navigate(['/auth/login']);
        return false;
      }
      return true;
    }),
    catchError(() => {
      router.navigate(['/auth/login']);
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

  router.navigate(['/admin/dashboard']);
  return false;
};
