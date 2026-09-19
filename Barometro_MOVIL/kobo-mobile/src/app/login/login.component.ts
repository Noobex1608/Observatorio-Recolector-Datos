import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
  private router = inject(Router);

  urlServidor: string = '';
  usuario: string = '';
  clave: string = '';

  cargando: boolean = false;
  errorLogin: string = '';

  async iniciarSesion() {
    this.errorLogin = '';

    const urlLimpia = this.urlServidor.trim().replace(/\/+$/, '');
    const usuarioLimpio = this.usuario.trim();
    const claveLimpia = this.clave.trim();

    if (!urlLimpia || !usuarioLimpio || !claveLimpia) {
      this.errorLogin = 'Completa la URL del servidor, usuario y contraseña.';
      return;
    }

    this.cargando = true;
    try {
      const response = await this.api.login(urlLimpia, usuarioLimpio, claveLimpia);
      this.auth.guardarSesion(
        response.token,
        response.user.name,
        response.user.email,
        urlLimpia
      );
      this.cargando = false;
      this.router.navigate(['/']);
    } catch {
      this.cargando = false;
      this.errorLogin = 'No se pudo iniciar sesión. Verifica tus datos y la URL del servidor.';
    }
  }
}