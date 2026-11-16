import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { AuthRepository } from '../../repositories/auth.repository';
import { AuthSession, LoginCredentials } from '../../../features/auth/models/auth.model';

@Injectable()
export class SupabaseAuthAdapter implements AuthRepository {
  login(_credentials: LoginCredentials): Observable<AuthSession> {
    return throwError(() => new Error('SupabaseAuthAdapter pendiente de implementacion.'));
  }

  logout(): Observable<void> {
    return throwError(() => new Error('SupabaseAuthAdapter pendiente de implementacion.'));
  }
}
