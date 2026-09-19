import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthSessionService } from '../services/auth-session.service';
import { APP_ROUTES } from '../constants/route.constants';

export const authGuard: CanActivateFn = () => {
  const authSession = inject(AuthSessionService);
  const router = inject(Router);

  if (authSession.isAuthenticated) {
    return true;
  }

  return router.createUrlTree([APP_ROUTES.login]);
};
