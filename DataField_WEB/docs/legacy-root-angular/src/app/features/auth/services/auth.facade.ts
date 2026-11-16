import { inject, Injectable } from '@angular/core';
import { tap } from 'rxjs/operators';
import { AUTH_REPOSITORY } from '../../../core/tokens/repository.tokens';
import { AuthRepository } from '../../../data-access/repositories/auth.repository';
import { LoginCredentials } from '../models/auth.model';
import { AuthSessionService } from '../../../core/services/auth-session.service';

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly authRepository = inject(AUTH_REPOSITORY) as AuthRepository;
  private readonly authSessionService = inject(AuthSessionService);

  login(credentials: LoginCredentials) {
    return this.authRepository
      .login(credentials)
      .pipe(tap((session) => this.authSessionService.setSession(session)));
  }

  logout() {
    return this.authRepository.logout().pipe(tap(() => this.authSessionService.clearSession()));
  }
}
