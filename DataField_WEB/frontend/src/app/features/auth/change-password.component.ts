import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  standalone: true,
  selector: 'app-change-password',
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  template: `
    <main class="password-page">
      <form [formGroup]="form" (ngSubmit)="submit()">
        <h1>{{ 'auth.changePassword.title' | translate }}</h1>
        <p>{{ 'auth.changePassword.intro' | translate }}</p>
        <label>{{ 'auth.changePassword.current' | translate }}<input type="password" formControlName="current" autocomplete="current-password" /></label>
        <label>{{ 'auth.passwords.new' | translate }}<input type="password" formControlName="password" autocomplete="new-password" /></label>
        <label>{{ 'auth.passwords.confirm' | translate }}<input type="password" formControlName="confirmation" autocomplete="new-password" /></label>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button type="submit" [disabled]="form.invalid || busy()">{{ 'auth.changePassword.save' | translate }}</button>
      </form>
    </main>
  `,
  styles: [`
    .password-page { min-height: 100vh; display: grid; place-items: center; background: #f1f6fb; padding: 1rem; }
    form { display: grid; gap: 1rem; max-width: 430px; width: 100%; padding: 2rem; background: white; border: 1px solid #cbd9e6; border-radius: 10px; }
    h1 { margin: 0; color: #005689; } p { margin: 0; }
    label { display: grid; gap: .35rem; } input { padding: .7rem; border: 1px solid #aac1d4; border-radius: 5px; }
    button { padding: .75rem; background: #0059a8; border: 0; color: white; border-radius: 5px; cursor: pointer; }
    .error { color: #b91c1c; }
  `],
})
export class ChangePasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    current: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(12)]],
    confirmation: ['', Validators.required],
  });

  submit(): void {
    if (!this.auth.isAuthenticated()) { void this.router.navigate(['/auth/login']); return; }
    const { current, password, confirmation } = this.form.getRawValue();
    if (password !== confirmation) { this.error.set(this.i18n.instant('auth.passwords.mismatch')); return; }
    this.busy.set(true);
    this.auth.changePassword(current, password).subscribe({
      next: () => this.router.navigateByUrl(this.auth.takeReturnUrl()),
      error: (error) => { this.busy.set(false); this.error.set(error?.error?.message || this.i18n.instant('auth.changePassword.failed')); },
    });
  }
}
