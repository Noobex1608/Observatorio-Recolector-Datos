import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthFacade } from '../../services/auth.facade';
import { APP_ROUTES } from '../../../../core/constants/route.constants';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.css',
})
export class LoginPageComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authFacade = inject(AuthFacade);
  private readonly router = inject(Router);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['admin@universidad.edu', [Validators.required, Validators.email]],
    password: ['1234', [Validators.required, Validators.minLength(4)]],
  });

  protected errorMessage = '';

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.authFacade.login(this.form.getRawValue()).subscribe({
      next: () => this.router.navigateByUrl(APP_ROUTES.dashboard),
      error: () => {
        this.errorMessage = 'No fue posible iniciar sesión.';
      },
    });
  }
}
