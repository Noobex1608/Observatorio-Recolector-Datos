import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { ApiService } from '../api.service';

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

  readonly cargando = signal(false);
  readonly errorLogin = signal('');

  private defaultServerUrl(): string {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    return ['localhost', '127.0.0.1'].includes(hostname)
      ? `http://${hostname}:8000`
      : 'https://barometro-backend.onrender.com';
  }

  async iniciarSesion() {
    this.errorLogin.set('');

    const urlLimpia = this.urlServidor.trim().replace(/\/+$/, '');
    const usuarioLimpio = this.usuario.trim();

    if (!urlLimpia || !usuarioLimpio || !this.clave) {
      this.errorLogin.set('Completa la URL del servidor, usuario y contraseña.');
      return;
    }

    this.cargando.set(true);
    try {
      const response = await this.api.login(urlLimpia, usuarioLimpio, this.clave);
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

  private mensajeErrorLogin(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 422) {
        return 'Correo o contraseña incorrectos.';
      }
      if (error.status === 0) {
        return 'No se pudo conectar con el servidor API. Verifica su URL y que esté en funcionamiento.';
      }
    }
    return 'No se pudo iniciar sesión. Verifica tus datos y la URL del servidor.';
  }
}
