import { Component, OnInit, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';
import { AuthService } from '../auth.service';

/** Servidor elegido antes de ir a Microsoft (la página de retorno no lo conoce). */
export const MICROSOFT_SERVER_KEY = 'kobo_microsoft_server';
/** Mensaje de error que se muestra en el login tras volver de Microsoft. */
export const MICROSOFT_ERROR_KEY = 'kobo_microsoft_error';

const MENSAJES: Record<string, string> = {
  cancelled: 'Cancelaste el inicio de sesión con Microsoft.',
  expired: 'El inicio de sesión tardó demasiado. Vuelve a intentarlo.',
  not_institutional: 'Esa cuenta de Microsoft no es institucional de ULEAM. Los usuarios externos ingresan con correo y contraseña.',
  not_registered: 'Tu cuenta de ULEAM aún no tiene acceso a DataField. Pide a tu administrador que te registre.',
  inactive: 'Tu cuenta está desactivada. Contacta al administrador.',
  pending_approval: 'Tu solicitud de acceso quedó registrada. Un administrador debe aprobarla y asignarte un rol; luego vuelve a iniciar sesión con Microsoft.',
  rejected: 'Tu solicitud de acceso fue rechazada. Si crees que es un error, contacta al administrador.',
  account_mismatch: 'Este correo quedó vinculado a otra cuenta de Microsoft. Pide a un administrador que, en Usuarios, use «Restablecer vinculación con Microsoft» sobre tu cuenta y vuelve a entrar.',
  failed: 'Microsoft no pudo validar el inicio de sesión. Vuelve a intentarlo.',
};

/** Retorno del inicio de sesión con Microsoft 365: canjea el código y guarda la sesión. */
@Component({
  selector: 'app-microsoft-callback',
  template: `
    <main class="ms-callback" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <p>Completando el inicio de sesión con Microsoft…</p>
    </main>
  `,
  styles: [`
    .ms-callback { min-height: 100vh; display: grid; place-content: center; justify-items: center; gap: 1rem; padding: 1rem; text-align: center; }
    .spinner { width: 36px; height: 36px; border: 4px solid #cbd9e6; border-top-color: #0059a8; border-radius: 50%; animation: girar 0.9s linear infinite; }
    @keyframes girar { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
  `],
})
export class MicrosoftCallbackComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    const servidor = sessionStorage.getItem(MICROSOFT_SERVER_KEY);
    sessionStorage.removeItem(MICROSOFT_SERVER_KEY);
    // El código no debe quedar en el historial.
    window.history.replaceState(null, '', window.location.pathname);

    if (error || !code || !servidor) {
      this.volverAlLogin(MENSAJES[error ?? ''] ?? MENSAJES['failed']);
      return;
    }
    try {
      const response = await this.api.exchangeMicrosoftCode(servidor, code);
      this.auth.guardarSesion(response.token, response.user.id, response.user.name, response.user.email, response.user.rol, servidor);
      window.location.replace(new URL('.', document.baseURI).href);
    } catch (err) {
      this.volverAlLogin(err instanceof HttpErrorResponse && err.error?.message ? err.error.message : MENSAJES['failed']);
    }
  }

  private volverAlLogin(mensaje: string): void {
    sessionStorage.setItem(MICROSOFT_ERROR_KEY, mensaje);
    void this.router.navigate(['/login'], { replaceUrl: true });
  }
}
