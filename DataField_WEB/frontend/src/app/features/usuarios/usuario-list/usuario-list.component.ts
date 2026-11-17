import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { AccessRequest } from '@core/services/user.service';
import { assignableRoles, ROLE_LABELS } from '@core/utils/role-rules';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDivider } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { NotificationService } from '@core/services/notification.service';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { User, UserRole } from '@core/models';
import { UserService } from '@core/services/user.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-usuario-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    MatDivider,
    TranslateModule,
  ],
  templateUrl: './usuario-list.component.html',
  styleUrl: './usuario-list.component.scss',
})
export class UsuarioListComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  displayedColumns = ['name', 'email', 'rol', 'is_active', 'created_at', 'actions'];
  
  users = signal<User[]>([]);
  loading = signal(true);
  
  // Pagination
  currentPage = signal(1);
  totalItems = signal(0);
  pageSize = signal(15);
  lastPage = signal(1);

  private readonly authService = inject(AuthService);
  /** Rol de quien administra: SUPER_ADMIN asigna todo; ADMIN solo líder, supervisor y recolector. */
  readonly actorRole = this.authService.userRole;
  readonly isSuperAdmin = this.authService.isSuperAdmin;

  // Solicitudes de acceso (personas de ULEAM que entraron con Microsoft sin estar registradas)
  readonly accessRequests = signal<AccessRequest[]>([]);
  readonly pendingCount = signal(0);
  readonly requestStatus = signal<'PENDING' | 'REJECTED'>('PENDING');
  readonly requestRoles: Partial<Record<number, UserRole>> = {};
  readonly busyRequest = signal<number | null>(null);
  readonly requestableRoles = computed(() => assignableRoles(this.actorRole(), true));

  ngOnInit(): void {
    this.loadUsers();
    this.loadAccessRequests();
  }

  /** Roles que se pueden asignar a este usuario (según quien administra y si es externo). */
  rolesFor(user: User): UserRole[] {
    return assignableRoles(this.actorRole(), user.is_institutional ?? true);
  }

  loadAccessRequests(status: 'PENDING' | 'REJECTED' = this.requestStatus()): void {
    this.requestStatus.set(status);
    this.userService.getAccessRequests(status).subscribe({
      next: (response) => {
        this.accessRequests.set(response.data);
        this.pendingCount.set(response.pending_count);
      },
      error: () => this.accessRequests.set([]),
    });
  }

  approveRequest(request: AccessRequest): void {
    const rol = this.requestRoles[request.id] ?? 'RECOLECTOR';
    this.busyRequest.set(request.id);
    this.userService.approveAccessRequest(request.id, rol).subscribe({
      next: (response) => {
        this.notify.success(response.message);
        this.busyRequest.set(null);
        this.loadAccessRequests();
        this.loadUsers(this.currentPage());
      },
      error: (err) => {
        this.notify.error(err.error?.message || 'No se pudo aprobar la solicitud.');
        this.busyRequest.set(null);
      },
    });
  }

  rejectRequest(request: AccessRequest): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Rechazar solicitud',
        message: `${request.name} (${request.email}) no tendrá acceso. Podrás aprobarla más tarde desde "Rechazadas".`,
        confirmText: 'Rechazar',
        cancelText: this.translate.instant('common.buttons.cancel'),
        confirmColor: 'warn',
      },
    }).afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.busyRequest.set(request.id);
      this.userService.rejectAccessRequest(request.id).subscribe({
        next: (response) => {
          this.notify.success(response.message);
          this.busyRequest.set(null);
          this.loadAccessRequests();
        },
        error: (err) => {
          this.notify.error(err.error?.message || 'No se pudo rechazar la solicitud.');
          this.busyRequest.set(null);
        },
      });
    });
  }

  loadUsers(page = 1): void {
    this.loading.set(true);
    this.userService.getUsers(this.pageSize(), page).subscribe({
      next: (response) => {
        this.users.set(response.data);
        this.currentPage.set(response.meta.current_page);
        this.totalItems.set(response.meta.total);
        this.lastPage.set(response.meta.last_page);
        this.loading.set(false);
      },
      error: () => {
        this.notify.error(this.translate.instant('users.messages.loadError'));
        this.loading.set(false);
      },
    });
  }

  onPageChange(event: PageEvent): void {
    this.pageSize.set(event.pageSize);
    this.loadUsers(event.pageIndex + 1);
  }

  toggleStatus(user: User): void {
    const newStatus = !user.is_active;
    const action = newStatus ? 'activar' : 'desactivar';
    
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant('users.confirmToggle.title'),
        message: this.translate.instant('users.confirmToggle.message', { name: user.name, action }),
        confirmText: this.translate.instant('common.buttons.confirm'),
        cancelText: this.translate.instant('common.buttons.cancel'),
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.userService.toggleUserStatus(user.id, newStatus).subscribe({
          next: () => {
            this.notify.success(this.translate.instant('users.messages.statusUpdated'));
            this.loadUsers(this.currentPage());
          },
          error: () => {
            this.notify.error(this.translate.instant('users.messages.statusError'));
          },
        });
      }
    });
  }

  changeRole(user: User, newRole: UserRole): void {
    if (user.rol === newRole) return;

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant('users.confirmRole.title'),
        message: this.translate.instant('users.confirmRole.message', { name: user.name, role: newRole }),
        confirmText: this.translate.instant('common.buttons.confirm'),
        cancelText: this.translate.instant('common.buttons.cancel'),
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.userService.updateUserRole(user.id, { rol: newRole }).subscribe({
          next: () => {
            this.notify.success(this.translate.instant('users.messages.roleUpdated'));
            this.loadUsers(this.currentPage());
          },
          error: () => {
            this.notify.error(this.translate.instant('users.messages.roleError'));
          },
        });
      }
    });
  }

  deleteUser(user: User): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant('users.confirmDelete.title'),
        message: this.translate.instant('users.confirmDelete.message', { name: user.name }),
        confirmText: this.translate.instant('common.buttons.delete'),
        cancelText: this.translate.instant('common.buttons.cancel'),
        confirmColor: 'warn',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.userService.deleteUser(user.id).subscribe({
          next: () => {
            this.notify.success(this.translate.instant('users.messages.deleted'));
            this.loadUsers(this.currentPage());
          },
          error: () => {
            this.notify.error(this.translate.instant('users.messages.deleteError'));
          },
        });
      }
    });
  }

  getRoleBadgeClass(rol: string): string {
    if (rol === 'SUPER_ADMIN') return 'badge-super-admin';
    if (rol === 'ADMIN') return 'badge-admin';
    if (rol === 'SUPERVISOR') return 'badge-supervisor';
    return rol === 'PROJECT' ? 'badge-project-leader' : 'badge-user';
  }

  getRoleLabel(rol: string): string {
    return ROLE_LABELS[rol as UserRole] ?? rol;
  }

  readonly roleIcons: Record<UserRole, string> = {
    SUPER_ADMIN: 'workspace_premium', ADMIN: 'security', PROJECT: 'assignment_ind',
    SUPERVISOR: 'supervisor_account', RECOLECTOR: 'person',
  };

  getStatusBadgeClass(isActive: boolean): string {
    return isActive ? 'badge-active' : 'badge-inactive';
  }

  formatDate(date: string | undefined): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString();
  }
}