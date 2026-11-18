import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '@core/services/auth.service';

/** Mensajes para los errores que devuelve el servidor tras el inicio de sesión con Microsoft 365. */
const MICROSOFT_ERRORS: Record<string, string> = {
  cancelled: 'Cancelaste el inicio de sesión con Microsoft.',
  expired: 'El inicio de sesión tardó demasiado. Vuelve a intentarlo.',
  not_institutional: 'Esa cuenta de Microsoft no es institucional de ULEAM. Los usuarios externos ingresan con correo y contraseña.',
  not_registered: 'Tu cuenta de ULEAM aún no tiene acceso a DataField. Pide a un administrador que te registre.',
  inactive: 'Tu cuenta está desactivada. Contacta al administrador.',
  pending_approval: 'Tu solicitud de acceso quedó registrada. Un administrador debe aprobarla y asignarte un rol; luego vuelve a iniciar sesión con Microsoft.',
  rejected: 'Tu solicitud de acceso fue rechazada. Si crees que es un error, contacta al administrador.',
  account_mismatch: 'Este correo quedó vinculado a otra cuenta de Microsoft. Pide a un administrador que, en Usuarios, use «Restablecer vinculación con Microsoft» sobre tu cuenta y vuelve a entrar.',
  failed: 'Microsoft no pudo validar el inicio de sesión. Vuelve a intentarlo.',
};

@Component({
  standalone: true,
  selector: 'app-microsoft-callback',
  imports: [MatProgressSpinnerModule, RouterLink],
  template: `
    <main class="callback-page">
      <section class="callback-card" aria-live="polite">
        @if (error()) {
          <h1>{{ pendingApproval() ? 'Solicitud de acceso enviada' : 'No se pudo iniciar sesión' }}</h1>
          <p [attr.role]="pendingApproval() ? 'status' : 'alert'">{{ error() }}</p>
          <a routerLink="/auth/login" class="btn-back">Volver al inicio de sesión</a>
        } @else {
          <mat-spinner diameter="36" aria-hidden="true"></mat-spinner>
          <p>Completando el inicio de sesión con Microsoft…</p>
        }
      </section>
    </main>
  `,
  styles: [`
    .callback-page { min-height: 100vh; display: grid; place-items: center; background: #f1f6fb; padding: 1rem; }
    .callback-card { display: grid; justify-items: center; gap: 1rem; max-width: 440px; width: 100%; padding: 2rem;
      background: white; border: 1px solid #cbd9e6; border-radius: 10px; text-align: center; }
    h1 { margin: 0; color: #005689; font-size: 1.35rem; } p { margin: 0; }
    /* :link/:visited explícitos: el estilo global de enlaces pintaba el texto del mismo azul del botón. */
    .btn-back, .btn-back:link, .btn-back:visited {
      display: inline-block; padding: .7rem 1.1rem; background: #0059a8; color: #fff;
      border-radius: 5px; text-decoration: none; font-weight: 600;
    }
    .btn-back:hover { background: #004a8c; color: #fff; }
    .btn-back:focus-visible { outline: 3px solid #0059a8; outline-offset: 3px; }
  `],
})
export class MicrosoftCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly error = signal('');
  /** La persona quedó registrada como solicitud de acceso: no es un error. */
  readonly pendingApproval = signal(false);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    const error = params.get('error');
    // El código no debe quedar en el historial ni en la barra de direcciones.
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });

    if (error || !code) {
      this.pendingApproval.set(error === 'pending_approval');
      this.error.set(MICROSOFT_ERRORS[error ?? ''] ?? MICROSOFT_ERRORS['failed']);
      return;
    }
    this.auth.completeMicrosoftLogin(code).subscribe({
      next: () => void this.router.navigateByUrl(this.auth.takeReturnUrl(), { replaceUrl: true }),
      error: (err) => this.error.set(err?.error?.message || MICROSOFT_ERRORS['failed']),
    });
  }
}
