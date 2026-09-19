import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, computed, ElementRef, inject, OnInit, PLATFORM_ID, signal, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { User } from '@core/models';
import { AuthService } from '@core/services/auth.service';
import { ProfileService, UpdateProfileData } from '@core/services/profile.service';
import { ThemeService } from '@core/services/theme.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslateModule,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly themeService = inject(ThemeService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  user = signal<User | null>(null);
  loading = signal(true);
  saving = signal(false);
  uploadingAvatar = signal(false);

  // Computed para obtener la URL completa del avatar
  avatarUrl = computed(() => {
    const avatar = this.user()?.perfil?.avatar;
    if (!avatar) return null;
    // Si ya es una URL absoluta, retornarla
    if (avatar.startsWith('http://') || avatar.startsWith('https://')) {
      return avatar;
    }
    // Construir URL completa desde el backend
    const baseUrl = environment.apiUrl.replace('/api', '');
    return `${baseUrl}${avatar}`;
  });

  profileForm!: FormGroup;

  ngOnInit(): void {
    this.initForm();

    if (isPlatformBrowser(this.platformId)) {
      this.loadProfile();
    } else {
      this.loading.set(false);
    }
  }

  private initForm(): void {
    this.profileForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      telefono: ['', [Validators.maxLength(20)]],
      cargo: ['', [Validators.maxLength(100)]],
      bio: ['', [Validators.maxLength(500)]],
    });
  }

  private loadProfile(): void {
    this.loading.set(true);
    this.profileService.getProfile().subscribe({
      next: (user) => {
        this.user.set(user);
        this.patchForm(user);
        this.loading.set(false);
      },
      error: () => {
        // Fallback to auth service user
        const authUser = this.authService.user();
        if (authUser) {
          this.user.set(authUser);
          this.patchForm(authUser);
        }
        this.loading.set(false);
      },
    });
  }

  private patchForm(user: User): void {
    this.profileForm.patchValue({
      name: user.name || '',
      telefono: user.perfil?.telefono || '',
      cargo: user.perfil?.cargo || '',
      bio: user.perfil?.bio || '',
    });
  }

  onSubmit(): void {
    if (this.profileForm.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    const data: UpdateProfileData = this.profileForm.value;

    this.profileService.updateProfile(data).subscribe({
      next: (user) => {
        this.user.set(user);
        this.authService.updateUser(user);
        this.snackBar.open(
          this.translate.instant('profile.messages.updateSuccess'),
          this.translate.instant('common.buttons.close'),
          { duration: 3000 }
        );
        this.saving.set(false);
      },
      error: () => {
        this.snackBar.open(
          this.translate.instant('profile.messages.updateError'),
          this.translate.instant('common.buttons.close'),
          { duration: 3000 }
        );
        this.saving.set(false);
      },
    });
  }

  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      return;
    }

    const file = input.files[0];

    // Validar tipo de archivo
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.snackBar.open(
        this.translate.instant('profile.messages.invalidFileType'),
        this.translate.instant('common.buttons.close'),
        { duration: 3000 }
      );
      return;
    }

    // Validar tamaño (2MB)
    if (file.size > 2 * 1024 * 1024) {
      this.snackBar.open(
        this.translate.instant('profile.messages.fileTooLarge'),
        this.translate.instant('common.buttons.close'),
        { duration: 3000 }
      );
      return;
    }

    this.uploadAvatar(file);
  }

  private uploadAvatar(file: File): void {
    this.uploadingAvatar.set(true);

    this.profileService.uploadAvatar(file).subscribe({
      next: (user) => {
        this.user.set(user);
        this.authService.updateUser(user);
        this.snackBar.open(
          this.translate.instant('profile.messages.avatarUpdated'),
          this.translate.instant('common.buttons.close'),
          { duration: 3000 }
        );
        this.uploadingAvatar.set(false);
        // Reset file input
        this.fileInput.nativeElement.value = '';
      },
      error: () => {
        this.snackBar.open(
          this.translate.instant('profile.messages.avatarError'),
          this.translate.instant('common.buttons.close'),
          { duration: 3000 }
        );
        this.uploadingAvatar.set(false);
      },
    });
  }

  deleteAvatar(): void {
    if (!this.user()?.perfil?.avatar) {
      return;
    }

    this.uploadingAvatar.set(true);

    this.profileService.deleteAvatar().subscribe({
      next: (user) => {
        this.user.set(user);
        this.authService.updateUser(user);
        this.snackBar.open(
          this.translate.instant('profile.messages.avatarDeleted'),
          this.translate.instant('common.buttons.close'),
          { duration: 3000 }
        );
        this.uploadingAvatar.set(false);
      },
      error: () => {
        this.snackBar.open(
          this.translate.instant('profile.messages.avatarError'),
          this.translate.instant('common.buttons.close'),
          { duration: 3000 }
        );
        this.uploadingAvatar.set(false);
      },
    });
  }

  getRoleBadgeClass(): string {
    if (this.user()?.rol === 'SUPER_ADMIN') return 'badge-super-admin';
    if (this.user()?.rol === 'ADMIN') return 'badge-admin';
    return this.user()?.rol === 'PROJECT' ? 'badge-project-leader' : 'badge-user';
  }

  getRoleLabel(): string {
    if (this.user()?.rol === 'SUPER_ADMIN') return 'profile.roles.superAdmin';
    if (this.user()?.rol === 'ADMIN') return 'profile.roles.admin';
    return this.user()?.rol === 'PROJECT' ? 'profile.roles.projectLeader' : 'profile.roles.user';
  }
}
