import { Injectable, signal } from '@angular/core';

const TOKEN_KEY = 'kobo_token';
const USER_KEY = 'kobo_user';
const USER_EMAIL_KEY = 'kobo_user_email';
const SERVER_KEY = 'kobo_server_url';
const DEMO_KEY = 'kobo_demo_mode';

@Injectable({ providedIn: 'root' })
export class AuthService {
  isAuthenticated = signal<boolean>(this.hayTokenGuardado());

  private hayTokenGuardado(): boolean {
    return !!localStorage.getItem(TOKEN_KEY);
  }

  guardarSesion(token: string, nombre: string, email: string, servidor: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, nombre);
    localStorage.setItem(USER_EMAIL_KEY, email);
    localStorage.setItem(SERVER_KEY, servidor);
    localStorage.removeItem(DEMO_KEY);
    this.isAuthenticated.set(true);
  }

  entrarModoDemo(): void {
    const tokenDemo = 'demo-token-' + Date.now();
    localStorage.setItem(TOKEN_KEY, tokenDemo);
    localStorage.setItem(USER_KEY, 'demo');
    localStorage.setItem(USER_EMAIL_KEY, 'demo@demo.com');
    localStorage.setItem(SERVER_KEY, 'modo-demo');
    localStorage.setItem(DEMO_KEY, 'true');
    this.isAuthenticated.set(true);
  }

  esModoDemo(): boolean {
    return localStorage.getItem(DEMO_KEY) === 'true';
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
    localStorage.removeItem(SERVER_KEY);
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

  actualizarUsuario(nombre: string): void {
    localStorage.setItem(USER_KEY, nombre);
  }
}
