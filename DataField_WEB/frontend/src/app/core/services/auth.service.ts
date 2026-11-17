import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, tap } from 'rxjs';
import { AuthResponse, LoginRequest, User, UserRole } from '../models';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const MICROSOFT_REMEMBER_KEY = 'auth_microsoft_remember';

export interface AuthProviders {
  microsoft: boolean;
  internal_domains: string[];
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly userSignal = signal<User | null>(this.getStoredUser());
  private readonly tokenSignal = signal<string | null>(this.getStoredToken());
  private readonly loadingSignal = signal(false);

  readonly user = computed(() => this.userSignal());
  readonly token = computed(() => this.tokenSignal());
  readonly isAuthenticated = computed(() => !!this.tokenSignal());
  readonly isLoading = computed(() => this.loadingSignal());
  readonly isSuperAdmin = computed(() => this.userSignal()?.rol === 'SUPER_ADMIN');
  readonly isAdmin = computed(() => ['SUPER_ADMIN', 'ADMIN'].includes(this.userSignal()?.rol ?? ''));
  readonly isProjectLeader = computed(() => this.userSignal()?.rol === 'PROJECT');
  readonly isRecolector = computed(() => this.userSignal()?.rol === 'RECOLECTOR');
  readonly isSupervisor = computed(() => this.userSignal()?.rol === 'SUPERVISOR');
  readonly userRole = computed(() => this.userSignal()?.rol ?? null);

  login(data: LoginRequest, rememberMe = false): Observable<AuthResponse> {
    this.loadingSignal.set(true);
    return this.api.post<AuthResponse>('/login', data).pipe(
      tap((response) => this.handleAuthSuccess(response, rememberMe)),
      finalize(() => this.loadingSignal.set(false))
    );
  }

  /** Métodos de inicio de sesión del servidor (si Microsoft 365 está configurado y qué dominios son internos). */
  providers(): Observable<AuthProviders> {
    return this.api.get<AuthProviders>('/auth/providers').pipe(
      catchError(() => of({ microsoft: false, internal_domains: [] })),
    );
  }

  /** Abre el inicio de sesión de Microsoft 365; el servidor vuelve a /auth/microsoft con un código. */
  startMicrosoftLogin(rememberMe = false): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(MICROSOFT_REMEMBER_KEY, rememberMe ? '1' : '0');
    const returnUrl = `${window.location.origin}/auth/microsoft`;
    window.location.assign(`${environment.apiUrl}/auth/microsoft/redirect?return=${encodeURIComponent(returnUrl)}`);
  }

  /** Canjea el código de un solo uso que devolvió el servidor por la sesión. */
  completeMicrosoftLogin(code: string): Observable<AuthResponse> {
    const rememberMe = typeof window !== 'undefined' && sessionStorage.getItem(MICROSOFT_REMEMBER_KEY) === '1';
    return this.api.post<AuthResponse>('/auth/microsoft/exchange', { code }).pipe(
      tap((response) => {
        sessionStorage.removeItem(MICROSOFT_REMEMBER_KEY);
        this.handleAuthSuccess(response, rememberMe);
      }),
    );
  }

  /** Usuario externo: confirma su correo y crea su contraseña con el enlace de la invitación. */
  activateAccount(email: string, token: string, password: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>('/auth/activate', {
      email, token, password, password_confirmation: password,
    });
  }

  changePassword(currentPassword: string, password: string): Observable<unknown> {
    return this.api.post('/change-password', {
      current_password: currentPassword, password, password_confirmation: password,
    }).pipe(tap(() => {
      const current = this.userSignal();
      if (current) this.updateUser({ ...current, must_change_password: false });
    }));
  }

  logout(): Observable<unknown> {
    return this.api.post('/logout', {}).pipe(
      tap(() => this.clearAuth()),
      catchError(() => {
        this.clearAuth();
        return of(null);
      })
    );
  }

  getCurrentUser(): Observable<User> {
    return this.api.get<User>('/user').pipe(
      tap((user) => {
        this.userSignal.set(user);
        this.storeUser(user);
      })
    );
  }

  checkAuth(): Observable<boolean> {
    if (!this.tokenSignal()) {
      return of(false);
    }

    return this.getCurrentUser().pipe(
      map(() => true),
      catchError(() => {
        this.clearAuth();
        return of(false);
      })
    );
  }

  hasRole(role: UserRole): boolean {
    return this.userSignal()?.rol === role;
  }

  hasAnyRole(roles: UserRole[]): boolean {
    const userRole = this.userSignal()?.rol;
    return userRole ? roles.includes(userRole) : false;
  }

  getToken(): string | null {
    return this.tokenSignal();
  }

  updateUser(user: User): void {
    this.userSignal.set(user);
    this.storeUser(user);
  }

  clearAuthSilent(): void {
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
  }

  private handleAuthSuccess(response: AuthResponse, rememberMe: boolean): void {
    this.tokenSignal.set(response.token);
    this.userSignal.set(response.user);
    this.storeToken(response.token, rememberMe);
    this.storeUser(response.user);
  }

  private clearAuth(): void {
    this.clearAuthSilent();
    void this.router.navigate(['/auth/login']);
  }

  private getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
  }

  private getStoredUser(): User | null {
    if (typeof window === 'undefined') return null;
    const storage = sessionStorage.getItem(TOKEN_KEY) ? sessionStorage : localStorage;
    const user = storage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  }

  private storeToken(token: string, rememberMe: boolean): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      (rememberMe ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    }
  }

  private storeUser(user: User): void {
    if (typeof window !== 'undefined') {
      const storage = sessionStorage.getItem(TOKEN_KEY) ? sessionStorage : localStorage;
      storage.setItem(USER_KEY, JSON.stringify(user));
    }
  }
}
