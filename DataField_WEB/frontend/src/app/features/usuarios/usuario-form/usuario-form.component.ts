import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
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
import { NotificationService } from '@core/services/notification.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { User, UserRole } from '@core/models';
import { assignableRoles, ROLE_LABELS } from '@core/utils/role-rules';
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
  private readonly notify = inject(NotificationService);
  private readonly translate = inject(TranslateService);
  private readonly authService = inject(AuthService);

  isEditMode = signal(false);
  userId = signal<number | null>(null);
  loading = signal(false);
  loadingUser = signal(false);
  user = signal<User | null>(null);
  hidePassword = signal(true);
  resendingInvitation = signal(false);
  /** Microsoft 365 configurado en el servidor y dominios institucionales de ULEAM. */
  private readonly microsoftEnabled = signal(false);
  private readonly internalDomains = signal<string[]>([]);
  private readonly typedEmail = signal('');

  /**
   * Cómo entra la cuenta según su correo:
   * - microsoft: institucional con Microsoft 365 (sin contraseña local).
   * - internal-password: institucional mientras Microsoft 365 no está configurado.
   * - external: correo y contraseña; recibe el correo de confirmación.
   */
  readonly accountKind = computed<'microsoft' | 'internal-password' | 'external' | null>(() => {
    const domain = this.typedEmail().trim().toLowerCase().split('@')[1] ?? '';
    if (!domain) return null;
    if (!this.internalDomains().includes(domain)) return 'external';
    return this.microsoftEnabled() ? 'microsoft' : 'internal-password';
  });

  /** Al crear, solo las cuentas internas sin Microsoft 365 llevan contraseña fijada por el administrador. */
  readonly showPassword = computed(() =>
    this.isEditMode() ? this.accountKind() !== 'microsoft' : this.accountKind() === 'internal-password');

  /**
   * Roles que se muestran: los que quien administra puede asignar y, si el correo es externo, solo
   * supervisor o recolector. Al editar se conserva el rol actual aunque no se pueda asignar.
   */
  readonly formRoles = computed<UserRole[]>(() => {
    const roles = assignableRoles(this.authService.userRole(), this.accountKind() !== 'external');
    const current = this.user()?.rol;
    return current && !roles.includes(current) ? [current, ...roles] : roles;
  });

  readonly roleOptions: Record<UserRole, { label: string; icon: string; descKey?: string }> = {
    SUPER_ADMIN: { label: ROLE_LABELS.SUPER_ADMIN, icon: 'workspace_premium', descKey: 'users.roles.superAdminDesc' },
    ADMIN: { label: ROLE_LABELS.ADMIN, icon: 'security', descKey: 'users.roles.adminDesc' },
    PROJECT: { label: ROLE_LABELS.PROJECT, icon: 'assignment_ind', descKey: 'users.roles.projectDesc' },
    SUPERVISOR: { label: 'Supervisor de campo', icon: 'visibility' },
    RECOLECTOR: { label: ROLE_LABELS.RECOLECTOR, icon: 'person', descKey: 'users.roles.recolectorDesc' },
  };

  userForm!: FormGroup;

  constructor() {
    this.authService.providers().subscribe((providers) => {
      this.microsoftEnabled.set(providers.microsoft);
      this.internalDomains.set(providers.internal_domains ?? []);
      this.updatePasswordValidators();
    });
  }

  ngOnInit(): void {
    this.initForm();
    this.userForm.get('email')!.valueChanges.subscribe((email: string) => {
      this.typedEmail.set(email ?? '');
      this.updatePasswordValidators();
      // Un correo externo no admite roles de administración: se ajusta a recolector.
      const rol = this.userForm.get('rol')!;
      if (!this.formRoles().includes(rol.value)) rol.setValue('RECOLECTOR');
    });

    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEditMode.set(true);
      this.userId.set(Number.parseInt(id, 10));
      this.loadUser();
    }
  }

  private initForm(): void {
    this.userForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
      password: ['', [Validators.minLength(8)]],
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
        this.updatePasswordValidators();
      },
      error: () => {
        this.notify.error(this.translate.instant('users.messages.loadError'));
        void this.router.navigate(['/admin/usuarios']);
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

    // Sin contraseña cuando no aplica (Microsoft 365 o invitación por correo) o no se cambió al editar.
    if (!this.showPassword() || !formData.password) {
      delete formData.password;
    }

    if (this.isEditMode()) {
      this.updateUser(formData);
    } else {
      this.createUser(formData);
    }
  }

  private createUser(data: any): void {
    this.saveUser(this.userService.createUser(data), 'users.messages.created', 'users.messages.createError');
  }

  private updateUser(data: any): void {
    const id = this.userId();
    if (!id) return;
    this.saveUser(this.userService.updateUser(id, data), 'users.messages.updated', 'users.messages.updateError');
  }

  /** Guarda el usuario, avisa el resultado y vuelve a la lista si salió bien. */
  private saveUser(request: Observable<unknown>, successKey: string, errorKey: string): void {
    request.subscribe({
      next: () => {
        this.notify.success(this.translate.instant(successKey));
        void this.router.navigate(['/admin/usuarios']);
      },
      error: (err) => {
        this.notify.error(err.error?.message || this.translate.instant(errorKey));
        this.loading.set(false);
      },
    });
  }

  /** La contraseña es obligatoria solo al crear una cuenta interna sin Microsoft 365. */
  private updatePasswordValidators(): void {
    const control = this.userForm?.get('password');
    if (!control) return;
    const required = !this.isEditMode() && this.accountKind() === 'internal-password';
    control.setValidators(required ? [Validators.required, Validators.minLength(8)] : [Validators.minLength(8)]);
    control.updateValueAndValidity({ emitEvent: false });
  }

  resendInvitation(): void {
    const id = this.userId();
    if (!id || this.resendingInvitation()) return;
    this.resendingInvitation.set(true);
    this.userService.resendInvitation(id).subscribe({
      next: (response) => {
        this.notify.success(response.message);
        this.resendingInvitation.set(false);
      },
      error: (err) => {
        this.notify.error(err.error?.message || 'No se pudo reenviar la invitación.');
        this.resendingInvitation.set(false);
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