import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthSessionService } from '../services/auth-session.service';
import { APP_ROUTES } from '../constants/route.constants';
import { Role } from '../../features/users/models/user.model';

export const roleGuard: CanActivateFn = (route) => {
  const authSession = inject(AuthSessionService);
  const router = inject(Router);
  const allowedRoles = (route.data?.['roles'] as Role[] | undefined) ?? [];
  const session = authSession.session();

  if (session && (allowedRoles.length === 0 || allowedRoles.includes(session.role))) {
    return true;
  }

  return router.createUrlTree([APP_ROUTES.dashboard]);
};
