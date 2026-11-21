import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

/**
 * Enlace de la invitación.
 * - Externo: confirma su correo y crea su contraseña.
 * - Institucional ULEAM (`tipo=microsoft`): solo confirma su usuario y luego entra con Microsoft 365.
 *   El servidor decide según el correo; el parámetro solo elige qué formulario mostrar.
 */
@Component({
  standalone: true,
  selector: 'app-activate-account',
  imports: [ReactiveFormsModule, RouterLink, TranslateModule],
  template: `
    <main class="activate-page">
      @if (done()) {
        <section class="card" aria-live="polite">
          @if (microsoft()) {
            <h1>{{ 'auth.activate.microsoftDoneTitle' | translate }}</h1>
            <p>{{ 'auth.activate.microsoftDoneText' | translate }}</p>
            <button type="button" class="btn-primary" (click)="signInWithMicrosoft()">{{ 'auth.activate.microsoftSignIn' | translate }}</button>
          } @else {
            <h1>{{ 'auth.activate.doneTitle' | translate }}</h1>
            <p>{{ 'auth.activate.doneText' | translate }}</p>
            <a routerLink="/auth/login" class="btn-primary">{{ 'auth.activate.signIn' | translate }}</a>
          }
        </section>
      } @else if (!token || !email) {
        <section class="card">
          <h1>{{ 'auth.activate.incompleteTitle' | translate }}</h1>
          <p role="alert">{{ 'auth.activate.incompleteText' | translate }}</p>
          <a routerLink="/auth/login" class="btn-primary">{{ 'auth.activate.goToLogin' | translate }}</a>
        </section>
      } @else if (microsoft()) {
        <form class="card" (ngSubmit)="confirmInstitutional()">
          <h1>{{ 'auth.activate.microsoftTitle' | translate }}</h1>
          <p>{{ 'auth.activate.microsoftIntroBefore' | translate }} <strong>{{ email }}</strong>{{ 'auth.activate.microsoftIntroAfter' | translate }}</p>
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          <button type="submit" class="btn-primary" [disabled]="busy()">{{ busy() ? ('auth.activate.saving' | translate) : ('auth.activate.microsoftSubmit' | translate) }}</button>
        </form>
      } @else {
        <form class="card" [formGroup]="form" (ngSubmit)="submit()">
          <h1>{{ 'auth.activate.title' | translate }}</h1>
          <p>{{ 'auth.activate.introBefore' | translate }} <strong>{{ email }}</strong>{{ 'auth.activate.introAfter' | translate }}</p>
          <label>{{ 'auth.passwords.new' | translate }}
            <input type="password" formControlName="password" autocomplete="new-password" />
          </label>
          <label>{{ 'auth.passwords.confirm' | translate }}
            <input type="password" formControlName="confirmation" autocomplete="new-password" />
          </label>
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          <button type="submit" class="btn-primary" [disabled]="busy()">{{ busy() ? ('auth.activate.saving' | translate) : ('auth.activate.submit' | translate) }}</button>
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
  private readonly i18n = inject(TranslateService);
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  readonly token = this.params.get('token') ?? '';
  readonly email = this.params.get('email') ?? '';
  readonly microsoft = signal(this.params.get('tipo') === 'microsoft');
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
      this.error.set(this.i18n.instant('auth.passwords.rules'));
      return;
    }
    if (password !== confirmation) {
      this.error.set(this.i18n.instant('auth.passwords.mismatch'));
      return;
    }
    this.send(password);
  }

  /** Institucional: solo confirma el usuario; no hay contraseña local. */
  confirmInstitutional(): void {
    this.send();
  }

  signInWithMicrosoft(): void {
    this.auth.startMicrosoftLogin();
  }

  private send(password?: string): void {
    this.busy.set(true);
    this.error.set('');
    this.auth.activateAccount(this.email, this.token, password).subscribe({
      next: (result) => {
        if (typeof result?.microsoft === 'boolean') this.microsoft.set(result.microsoft);
        this.done.set(true);
      },
      error: (err) => {
        this.busy.set(false);
        // Enlace con tipo equivocado: el servidor pide (o rechaza) la contraseña según el correo.
        const fieldErrors = err?.error?.errors ?? {};
        if (this.microsoft() && fieldErrors.password) {
          this.microsoft.set(false);
          this.error.set('');
          return;
        }
        this.error.set(err?.error?.message || this.i18n.instant('auth.activate.failed'));
      },
    });
  }
}
