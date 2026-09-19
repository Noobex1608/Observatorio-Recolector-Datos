import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { User } from '@core/models';
import { UserService } from '@core/services/user.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-usuario-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    TranslateModule,
  ],
  templateUrl: './usuario-form.component.html',
  styleUrl: './usuario-form.component.scss',
})
export class UsuarioFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  isEditMode = signal(false);
  userId = signal<number | null>(null);
  loading = signal(false);
  loadingUser = signal(false);
  user = signal<User | null>(null);
  hidePassword = signal(true);

  userForm!: FormGroup;

  ngOnInit(): void {
    this.initForm();

    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEditMode.set(true);
      this.userId.set(parseInt(id, 10));
      this.loadUser();
    }
  }

  private initForm(): void {
    this.userForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
      password: ['', this.isEditMode() ? [] : [Validators.required, Validators.minLength(8)]],
      rol: ['RECOLECTOR', [Validators.required]],
      is_active: [true],
      telefono: ['', [Validators.maxLength(20)]],
      cargo: ['', [Validators.maxLength(100)]],
      bio: ['', [Validators.maxLength(500)]],
    });
  }

  private loadUser(): void {
    const id = this.userId();
    if (!id) return;

    this.loadingUser.set(true);
    this.userService.getUserById(id).subscribe({
      next: (response) => {
        this.user.set(response.data);
        this.patchForm(response.data);
        this.loadingUser.set(false);
        // Password not required in edit mode
        this.userForm.get('password')?.clearValidators();
        this.userForm.get('password')?.updateValueAndValidity();
      },
      error: () => {
        this.snackBar.open(
          this.translate.instant('users.messages.loadError'),
          this.translate.instant('common.buttons.close'),
          { duration: 3000 }
        );
        this.router.navigate(['/admin/usuarios']);
      },
    });
  }

  private patchForm(user: User): void {
    this.userForm.patchValue({
      name: user.name || '',
      email: user.email || '',
      rol: user.rol || 'RECOLECTOR',
      is_active: user.is_active ?? true,
      telefono: user.perfil?.telefono || '',
      cargo: user.perfil?.cargo || '',
      bio: user.perfil?.bio || '',
    });
  }

  onSubmit(): void {
    if (this.userForm.invalid || this.loading()) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    const formData = { ...this.userForm.value };
    
    // Remove empty password in edit mode
    if (this.isEditMode() && !formData.password) {
      delete formData.password;
    }

    if (this.isEditMode()) {
      this.updateUser(formData);
    } else {
      this.createUser(formData);
    }
  }

  private createUser(data: any): void {
    this.userService.createUser(data).subscribe({
      next: () => {
        this.snackBar.open(
          this.translate.instant('users.messages.created'),
          this.translate.instant('common.buttons.close'),
          { duration: 3000 }
        );
        this.router.navigate(['/admin/usuarios']);
      },
      error: (err) => {
        const message = err.error?.message || this.translate.instant('users.messages.createError');
        this.snackBar.open(message, this.translate.instant('common.buttons.close'), { duration: 3000 });
        this.loading.set(false);
      },
    });
  }

  private updateUser(data: any): void {
    const id = this.userId();
    if (!id) return;

    this.userService.updateUser(id, data).subscribe({
      next: () => {
        this.snackBar.open(
          this.translate.instant('users.messages.updated'),
          this.translate.instant('common.buttons.close'),
          { duration: 3000 }
        );
        this.router.navigate(['/admin/usuarios']);
      },
      error: (err) => {
        const message = err.error?.message || this.translate.instant('users.messages.updateError');
        this.snackBar.open(message, this.translate.instant('common.buttons.close'), { duration: 3000 });
        this.loading.set(false);
      },
    });
  }

  togglePasswordVisibility(): void {
    this.hidePassword.update((v) => !v);
  }

  getTitle(): string {
    return this.isEditMode() ? 'users.form.editTitle' : 'users.form.createTitle';
  }

  getSubtitle(): string {
    return this.isEditMode() ? 'users.form.editSubtitle' : 'users.form.createSubtitle';
  }
}