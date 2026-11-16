import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthSessionService } from '../services/auth-session.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authSession = inject(AuthSessionService);
  const session = authSession.session();

  if (!session?.token) {
    return next(req);
  }

  const authenticated = req.clone({
    setHeaders: {
      Authorization: `Bearer ${session.token}`,
    },
  });

  return next(authenticated);
};
