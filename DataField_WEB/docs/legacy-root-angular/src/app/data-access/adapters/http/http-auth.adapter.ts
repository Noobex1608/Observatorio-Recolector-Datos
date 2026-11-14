import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { AuthRepository } from '../../repositories/auth.repository';
import { AuthSession, LoginCredentials } from '../../../features/auth/models/auth.model';
import { environment } from '../../../../environments/environment';

interface LoginResponse {
  user: { id: number; name: string; email: string; rol: string; perfil?: unknown };
  token: string;
}

@Injectable()
export class HttpAuthAdapter implements AuthRepository {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  login(credentials: LoginCredentials): Observable<AuthSession> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/login`, credentials)
      .pipe(
        map((res) => ({
          userId: res.user.id,
          name: res.user.name,
          email: res.user.email,
          role: res.user.rol as AuthSession['role'],
          token: res.token,
        })),
      );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {});
  }
}
