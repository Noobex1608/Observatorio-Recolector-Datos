import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { ApiService, LoginResponse } from '../api.service';
import { trimTrailingSlashes } from '../utils/url';
import { MICROSOFT_ERROR_KEY, MICROSOFT_SERVER_KEY } from './microsoft-callback.component';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  private auth = inject(AuthService);
  private api = inject(ApiService);

  urlServidor: string = this.defaultServerUrl();
  usuario: string = '';
  clave: string = '';
  nuevaClave: string = '';
  confirmarClave: string = '';
  readonly requiereCambio = signal(false);
  private pendingLogin: { response: LoginResponse; servidor: string; clave: string } | null = null;

  readonly cargando = signal(false);
  readonly errorLogin = signal('');
  /** El servidor elegido ofrece inicio con Microsoft 365 (cuentas institucionales de ULEAM). */
  readonly microsoftDisponible = signal(false);
  private dominiosInternos: string[] = [];

  constructor() {
    void this.consultarProveedores();
    // Mensaje que dejó la pantalla de retorno de Microsoft si el inicio falló.
    const error = sessionStorage.getItem(MICROSOFT_ERROR_KEY);
    if (error) {
      sessionStorage.removeItem(MICROSOFT_ERROR_KEY);
      this.errorLogin.set(error);
    }
  }

  /** Se consulta al abrir y cada vez que cambia la URL del servidor. */
  async consultarProveedores(): Promise<void> {
    const servidor = trimTrailingSlashes(this.urlServidor.trim());
    if (!servidor) {
      this.microsoftDisponible.set(false);
      return;
    }
    try {
      const proveedores = await this.api.microsoftEnabled(servidor);
      this.microsoftDisponible.set(proveedores.microsoft);
      this.dominiosInternos = proveedores.internal_domains ?? [];
    } catch {
      this.microsoftDisponible.set(false);
    }
  }

  esCorreoInstitucional(): boolean {
    const dominio = this.usuario.trim().toLowerCase().split('@')[1] ?? '';
    return this.microsoftDisponible() && !!dominio && this.dominiosInternos.includes(dominio);
  }

  iniciarConMicrosoft(): void {
    const servidor = trimTrailingSlashes(this.urlServidor.trim());
    try {
      const retorno = new URL('auth/microsoft', document.baseURI).href;
      const url = this.api.microsoftLoginUrl(servidor, retorno);
      // localStorage: la página de retorno puede abrirse en otra pestaña o en la app instalada.
      localStorage.setItem(MICROSOFT_SERVER_KEY, servidor);
      this.cargando.set(true);
      window.location.assign(url);
    } catch (error) {
      this.errorLogin.set(error instanceof Error ? error.message : 'La URL del servidor no es válida.');
    }
  }

  private defaultServerUrl(): string {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    return ['localhost', '127.0.0.1'].includes(hostname)
      ? `http://${hostname}:8000`
      : 'https://barometro-backend.onrender.com';
  }

  async iniciarSesion() {
    this.errorLogin.set('');
    if (this.esCorreoInstitucional()) {
      this.iniciarConMicrosoft();
      return;
    }

    const urlLimpia = trimTrailingSlashes(this.urlServidor.trim());
    const usuarioLimpio = this.usuario.trim();

    if (!urlLimpia || !usuarioLimpio || !this.clave) {
      this.errorLogin.set('Completa la URL del servidor, usuario y contraseña.');
      return;
    }

    this.cargando.set(true);
    try {
      const response = await this.api.login(urlLimpia, usuarioLimpio, this.clave);
      if (response.user.must_change_password) {
        this.pendingLogin = { response, servidor: urlLimpia, clave: this.clave };
        this.requiereCambio.set(true);
        return;
      }
      this.auth.guardarSesion(
        response.token,
        response.user.id,
        response.user.name,
        response.user.email,
        response.user.rol,
        urlLimpia
      );
      window.location.replace(new URL('.', document.baseURI).href);
    } catch (error) {
      this.errorLogin.set(this.mensajeErrorLogin(error));
    } finally {
      this.cargando.set(false);
    }
  }

  async cambiarClaveTemporal(): Promise<void> {
    this.errorLogin.set('');
    const pending = this.pendingLogin;
    if (!pending) return;
    if (this.nuevaClave.length < 12 || !/[a-z]/.test(this.nuevaClave) || !/[A-Z]/.test(this.nuevaClave) || !/[0-9]/.test(this.nuevaClave)) {
      this.errorLogin.set('Usa al menos 12 caracteres, con mayúsculas, minúsculas y números.');
      return;
    }
    if (this.nuevaClave !== this.confirmarClave) {
      this.errorLogin.set('Las contraseñas no coinciden.');
      return;
    }
    this.cargando.set(true);
    try {
      await this.api.changeTemporaryPassword(pending.servidor, pending.response.token, pending.clave, this.nuevaClave);
      const { response, servidor } = pending;
      this.auth.guardarSesion(response.token, response.user.id, response.user.name, response.user.email, response.user.rol, servidor);
      this.pendingLogin = null;
      this.clave = '';
      this.nuevaClave = '';
      this.confirmarClave = '';
      window.location.replace(new URL('.', document.baseURI).href);
    } catch (error) {
      this.errorLogin.set(error instanceof HttpErrorResponse ? error.error?.message || 'No se pudo cambiar la contraseña.' : 'No se pudo cambiar la contraseña.');
    } finally {
      this.cargando.set(false);
    }
  }

  private mensajeErrorLogin(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 422) {
        const mensaje = String(error.error?.message ?? '');
        return mensaje.includes('Microsoft') ? mensaje : 'Correo o contraseña incorrectos.';
      }
      if (error.status === 0) {
        return 'No se pudo conectar con el servidor API. Verifica su URL y que esté en funcionamiento.';
      }
    }
    return 'No se pudo iniciar sesión. Verifica tus datos y la URL del servidor.';
  }
}
