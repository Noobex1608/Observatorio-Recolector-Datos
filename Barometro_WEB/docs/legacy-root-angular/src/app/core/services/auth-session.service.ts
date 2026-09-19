import { Injectable, signal } from '@angular/core';
import { AuthSession } from '../../features/auth/models/auth.model';

const STORAGE_KEY = 'auth_session';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly sessionSignal = signal<AuthSession | null>(this.loadFromStorage());

  readonly session = this.sessionSignal.asReadonly();

  setSession(session: AuthSession): void {
    this.sessionSignal.set(session);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // localStorage may be unavailable
    }
  }

  clearSession(): void {
    this.sessionSignal.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage may be unavailable
    }
  }

  get isAuthenticated(): boolean {
    return this.sessionSignal() !== null;
  }

  private loadFromStorage(): AuthSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AuthSession;
    } catch {
      return null;
    }
  }
}
