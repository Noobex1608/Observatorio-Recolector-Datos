import { Injectable, signal } from '@angular/core';
import { ACCOUNT_SCOPE_KEY, accountScope } from './db.service';

const TOKEN_KEY = 'kobo_token';
const USER_KEY = 'kobo_user';
const USER_EMAIL_KEY = 'kobo_user_email';
const USER_ROLE_KEY = 'kobo_user_role';
const SERVER_KEY = 'kobo_server_url';
const DEMO_KEY = 'kobo_demo_mode';

@Injectable({ providedIn: 'root' })
export class AuthService {
  isAuthenticated = signal<boolean>(this.hayTokenGuardado());

  constructor() {
    window.addEventListener('storage', event => {
      if (event.key === ACCOUNT_SCOPE_KEY && event.oldValue !== event.newValue) {
        window.location.reload();
      }
    });
  }

  private hayTokenGuardado(): boolean {
    return !!localStorage.getItem(TOKEN_KEY) && !!localStorage.getItem(ACCOUNT_SCOPE_KEY);
  }

  guardarSesion(token: string, userId: number, nombre: string, email: string, rol: string, servidor: string): void {
    const scope = accountScope(userId, servidor);
    if (localStorage.getItem(ACCOUNT_SCOPE_KEY) !== scope) {
      localStorage.removeItem('field_tracking_active_shift');
      window.dispatchEvent(new Event('field-tracking-logout'));
    }
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, nombre);
    localStorage.setItem(USER_EMAIL_KEY, email);
    localStorage.setItem(USER_ROLE_KEY, rol);
    localStorage.setItem(SERVER_KEY, servidor);
    localStorage.setItem(ACCOUNT_SCOPE_KEY, scope);
    localStorage.removeItem(DEMO_KEY);
    this.isAuthenticated.set(true);
  }

  entrarModoDemo(): void {
    const tokenDemo = 'demo-token-' + Date.now();
    localStorage.setItem(TOKEN_KEY, tokenDemo);
    localStorage.setItem(USER_KEY, 'demo');
    localStorage.setItem(USER_EMAIL_KEY, 'demo@demo.com');
    localStorage.removeItem(USER_ROLE_KEY);
    localStorage.setItem(SERVER_KEY, 'modo-demo');
    localStorage.setItem(ACCOUNT_SCOPE_KEY, 'demo');
    localStorage.setItem(DEMO_KEY, 'true');
    this.isAuthenticated.set(true);
  }

  esModoDemo(): boolean {
    return localStorage.getItem(DEMO_KEY) === 'true';
  }

  logout(): void {
    localStorage.removeItem('field_tracking_active_shift');
    window.dispatchEvent(new Event('field-tracking-logout'));
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
    localStorage.removeItem(USER_ROLE_KEY);
    localStorage.removeItem(SERVER_KEY);
    localStorage.removeItem(ACCOUNT_SCOPE_KEY);
    localStorage.removeItem(DEMO_KEY);
    this.isAuthenticated.set(false);
  }

  obtenerToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  obtenerUsuario(): string | null {
    return localStorage.getItem(USER_KEY);
  }

  obtenerUrlServidor(): string | null {
    return localStorage.getItem(SERVER_KEY);
  }

  obtenerEmail(): string | null {
    return localStorage.getItem(USER_EMAIL_KEY);
  }

  obtenerRol(): string | null {
    return localStorage.getItem(USER_ROLE_KEY);
  }

  actualizarUsuario(nombre: string): void {
    localStorage.setItem(USER_KEY, nombre);
  }
}
