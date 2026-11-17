import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';

/** Usuario externo: confirma su correo y crea su contraseña desde el enlace de la invitación. */
@Component({
  standalone: true,
  selector: 'app-activate-account',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="activate-page">
      @if (done()) {
        <section class="card" aria-live="polite">
          <h1>Cuenta confirmada</h1>
          <p>Tu correo quedó confirmado y tu contraseña creada. Ya puedes iniciar sesión en la web o en la app de recolección.</p>
          <a routerLink="/auth/login" class="btn-primary">Iniciar sesión</a>
        </section>
      } @else if (!token || !email) {
        <section class="card">
          <h1>Enlace incompleto</h1>
          <p role="alert">Abre el enlace completo del correo de invitación o pide al administrador que te lo reenvíe.</p>
          <a routerLink="/auth/login" class="btn-primary">Ir al inicio de sesión</a>
        </section>
      } @else {
        <form class="card" [formGroup]="form" (ngSubmit)="submit()">
          <h1>Confirma tu cuenta</h1>
          <p>Crea la contraseña para <strong>{{ email }}</strong>. Usa al menos 12 caracteres con mayúsculas, minúsculas y números.</p>
          <label>Nueva contraseña
            <input type="password" formControlName="password" autocomplete="new-password" />
          </label>
          <label>Confirmar contraseña
            <input type="password" formControlName="confirmation" autocomplete="new-password" />
          </label>
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          <button type="submit" class="btn-primary" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Confirmar y crear contraseña' }}</button>
        </form>
      }
    </main>
  `,
  styles: [`
    .activate-page { min-height: 100vh; display: grid; place-items: center; background: #f1f6fb; padding: 1rem; }
    .card { display: grid; gap: 1rem; max-width: 440px; width: 100%; padding: 2rem; background: white;
      border: 1px solid #cbd9e6; border-radius: 10px; box-sizing: border-box; }
    h1 { margin: 0; color: #005689; font-size: 1.35rem; } p { margin: 0; overflow-wrap: anywhere; }
    label { display: grid; gap: .35rem; } input { padding: .7rem; border: 1px solid #aac1d4; border-radius: 5px; font: inherit; }
    .btn-primary, .btn-primary:link, .btn-primary:visited { padding: .75rem; background: #0059a8; border: 0; color: #fff; border-radius: 5px;
      cursor: pointer; text-align: center; text-decoration: none; font: inherit; font-weight: 600; }
    .btn-primary:hover:not(:disabled) { background: #004a8c; color: #fff; }
    .btn-primary:focus-visible { outline: 3px solid #0059a8; outline-offset: 3px; }
    .btn-primary:disabled { opacity: .6; cursor: default; }
    .error { color: #b91c1c; }
  `],
})
export class ActivateAccountComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  readonly token = this.params.get('token') ?? '';
  readonly email = this.params.get('email') ?? '';
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal(false);
  readonly form = this.fb.nonNullable.group({
    password: ['', Validators.required],
    confirmation: ['', Validators.required],
  });

  submit(): void {
    const { password, confirmation } = this.form.getRawValue();
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      this.error.set('La contraseña necesita al menos 12 caracteres, con mayúsculas, minúsculas y números.');
      return;
    }
    if (password !== confirmation) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.auth.activateAccount(this.email, this.token, password).subscribe({
      next: () => this.done.set(true),
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.message || 'No se pudo confirmar la cuenta. Intenta de nuevo.');
      },
    });
  }
}
