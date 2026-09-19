import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError, timer } from 'rxjs';
import { retry, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { BackendWarmupService } from '../services/backend-warmup.service';

const HEALTH_SUFFIX = '/health';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 800;

/**
 * Gates every /api/* call on the backend warmup ping and retries transient
 * 5xx/network errors with exponential backoff. Prevents Render free-tier
 * cold-start 500s from leaking into the UI.
 *
 * Must run AFTER authInterceptor in the chain so each retry carries the
 * already-applied Authorization header.
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  // Only gate our own API — don't interfere with i18n assets or third parties.
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  if (!environment.production) {
    return next(req);
  }

  // The health check itself must not re-enter this gate.
  if (req.url.endsWith(HEALTH_SUFFIX)) {
    return next(req);
  }

  const warmup = inject(BackendWarmupService);

  return warmup.ready$().pipe(
    switchMap(() =>
      next(req).pipe(
        retry({
          count: MAX_RETRIES,
          delay: (err, attempt) => {
            const status = (err as HttpErrorResponse).status;
            // Retry server errors and network failures; bubble 4xx up so
            // auth/validation handlers see them immediately.
            if (status >= 500 || status === 0) {
              return timer(BASE_DELAY_MS * 2 ** attempt);
            }
            return throwError(() => err);
          },
        }),
      ),
    ),
  );
};
