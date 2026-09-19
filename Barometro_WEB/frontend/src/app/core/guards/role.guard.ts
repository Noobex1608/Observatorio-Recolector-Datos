import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models';

/**
 * Guard que verifica si el usuario tiene rol ADMIN
 * Redirige a /admin/dashboard si no tiene permisos
 */
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAdmin()) {
    return true;
  }

  // Redirigir a dashboard si no es admin
  router.navigate(['/admin/dashboard']);
  return false;
};

/**
 * Guard configurable que verifica si el usuario tiene alguno de los roles especificados
 */
export function roleGuard(...allowedRoles: UserRole[]): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.hasAnyRole(allowedRoles)) {
      return true;
    }

    // Redirigir según el rol del usuario
    const userRole = authService.userRole();
    if (!userRole) {
      router.navigate(['/auth/login']);
    } else {
      router.navigate(['/admin/dashboard']);
    }
    
    return false;
  };
}
