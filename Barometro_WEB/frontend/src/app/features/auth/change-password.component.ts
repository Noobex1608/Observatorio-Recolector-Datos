import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';

@Component({
  standalone: true,
  selector: 'app-change-password',
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <main class="password-page">
      <form [formGroup]="form" (ngSubmit)="submit()">
        <h1>Cambia tu contraseña temporal</h1>
        <p>Para continuar, crea una contraseña personal de al menos 12 caracteres con mayúsculas, minúsculas y números.</p>
        <label>Contraseña temporal<input type="password" formControlName="current" autocomplete="current-password" /></label>
        <label>Nueva contraseña<input type="password" formControlName="password" autocomplete="new-password" /></label>
        <label>Confirmar contraseña<input type="password" formControlName="confirmation" autocomplete="new-password" /></label>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button type="submit" [disabled]="form.invalid || busy()">Guardar contraseña</button>
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
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    current: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(12)]],
    confirmation: ['', Validators.required],
  });

  submit(): void {
    if (!this.auth.isAuthenticated()) { this.router.navigate(['/auth/login']); return; }
    const { current, password, confirmation } = this.form.getRawValue();
    if (password !== confirmation) { this.error.set('Las contraseñas no coinciden.'); return; }
    this.busy.set(true);
    this.auth.changePassword(current, password).subscribe({
      next: () => this.router.navigate(['/admin/dashboard']),
      error: (error) => { this.busy.set(false); this.error.set(error?.error?.message || 'No se pudo actualizar la contraseña.'); },
    });
  }
}
