import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { Role } from '../../models/user.model';
import { UsersFacade } from '../../services/users.facade';

@Component({
  selector: 'app-user-form-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './user-form-page.component.html',
  styleUrl: './user-form-page.component.css',
})
export class UserFormPageComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly usersFacade = inject(UsersFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly userId = this.route.snapshot.paramMap.get('id');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);

  protected readonly roleOptions: Role[] = ['SUPER_ADMIN', 'ADMIN', 'PROJECT_LEADER', 'USER'];

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['USER' as Role, [Validators.required]],
    isActive: [true],
  });

  constructor() {
    if (!this.userId) {
      return;
    }

    this.loading.set(true);
    this.usersFacade
      .findById(this.userId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((user) => {
        if (!user) {
          return;
        }

        this.form.patchValue({
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        });
      });
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    const payload = this.form.getRawValue();
    const request$ = this.userId
      ? this.usersFacade.update(this.userId, payload)
      : this.usersFacade.create(payload);

    this.saving.set(true);
    request$.pipe(finalize(() => this.saving.set(false))).subscribe(() => {
      this.router.navigateByUrl('/users');
    });
  }

  protected roleLabel(role: Role): string {
    if (role === 'SUPER_ADMIN') {
      return 'Super Administrador';
    }

    if (role === 'ADMIN') {
      return 'Administrador';
    }

    if (role === 'PROJECT_LEADER') {
      return 'Líder de Proyecto';
    }

    return 'Recolector';
  }
}
