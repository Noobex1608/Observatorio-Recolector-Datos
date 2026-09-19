import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, tap } from 'rxjs';
import { AuthResponse, LoginRequest, User, UserRole } from '../models';
import { ApiService } from './api.service';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

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
  readonly userRole = computed(() => this.userSignal()?.rol ?? null);

  login(data: LoginRequest): Observable<AuthResponse> {
    this.loadingSignal.set(true);
    return this.api.post<AuthResponse>('/login', data).pipe(
      tap((response) => this.handleAuthSuccess(response)),
      finalize(() => this.loadingSignal.set(false))
    );
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
    }
  }

  private handleAuthSuccess(response: AuthResponse): void {
    this.tokenSignal.set(response.token);
    this.userSignal.set(response.user);
    this.storeToken(response.token);
    this.storeUser(response.user);
  }

  private clearAuth(): void {
    this.clearAuthSilent();
    this.router.navigate(['/auth/login']);
  }

  private getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  private getStoredUser(): User | null {
    if (typeof window === 'undefined') return null;
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  }

  private storeToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token);
    }
  }

  private storeUser(user: User): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  }
}
