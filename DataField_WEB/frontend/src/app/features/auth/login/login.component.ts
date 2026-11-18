import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatProgressSpinnerModule, TranslateModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    rememberMe: false,
  });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hidePassword = signal(true);
  /** Inicio con Microsoft 365 disponible (lo informa el servidor) y dominios institucionales. */
  readonly microsoftEnabled = signal(false);
  private readonly internalDomains = signal<string[]>([]);
  private readonly typedEmail = toSignal(this.form.controls.email.valueChanges, { initialValue: '' });
  /**
   * Acceso de emergencia: el SUPER_ADMIN con correo institucional puede entrar con contraseña
   * (el backend lo permite solo a ese rol). Se activa con el enlace bajo el aviso de Microsoft.
   */
  readonly usePasswordInstead = signal(false);
  /** El correo escrito es institucional: esa cuenta entra con Microsoft, no con contraseña. */
  readonly isInstitutionalEmail = computed(() => {
    const domain = this.typedEmail().trim().toLowerCase().split('@')[1] ?? '';
    return this.microsoftEnabled() && !!domain && this.internalDomains().includes(domain) && !this.usePasswordInstead();
  });

  constructor() {
    this.authService.providers().subscribe((providers) => {
      this.microsoftEnabled.set(providers.microsoft);
      this.internalDomains.set(providers.internal_domains ?? []);
    });
  }

  signInWithMicrosoft(): void {
    this.loading.set(true);
    this.authService.startMicrosoftLogin(this.form.controls.rememberMe.value);
  }

  onSubmit(): void {
    if (this.isInstitutionalEmail()) {
      this.signInWithMicrosoft();
      return;
    }
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    const { email, password, rememberMe } = this.form.getRawValue();

    this.authService.login({ email: email.trim(), password }, rememberMe).subscribe({
      next: (response) => {
        void this.router.navigateByUrl(response.user.must_change_password ? '/auth/change-password' : this.authService.takeReturnUrl());
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message || this.translate.instant('auth.login.errors.loginFailed'));
      },
    });
  }
}
