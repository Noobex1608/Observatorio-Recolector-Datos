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

  /** Usuarios vigentes o eliminados (borrado suave, se pueden restaurar). */
  readonly userView = signal<'active' | 'deleted'>('active');
  readonly displayedColumns = computed(() => this.userView() === 'deleted'
    ? ['name', 'email', 'rol', 'deleted_at', 'restore']
    : ['name', 'email', 'rol', 'is_active', 'created_at', 'actions']);
  readonly restoringUser = signal<number | null>(null);
  
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
  /** Rol elegido por solicitud; sin elegir, Recolector. */
  readonly requestRoles = signal<Partial<Record<number, UserRole>>>({});
  readonly busyRequest = signal<number | null>(null);
  readonly bulkBusy = signal(false);
  readonly requestableRoles = computed(() => assignableRoles(this.actorRole(), true));
  readonly requestSearch = signal('');
  readonly selectedRequests = signal<ReadonlySet<number>>(new Set());

  /** Solicitudes que coinciden con la búsqueda (nombre o correo, sin distinguir tildes). */
  readonly filteredRequests = computed(() => {
    const term = normalize(this.requestSearch());
    const requests = this.accessRequests();
    return term ? requests.filter((request) => normalize(`${request.name} ${request.email}`).includes(term)) : requests;
  });
  /** Seleccionadas que siguen en la lista (la búsqueda no deselecciona). */
  readonly selectedList = computed(() => this.accessRequests().filter((request) => this.selectedRequests().has(request.id)));
  readonly allFilteredSelected = computed(() => {
    const visible = this.filteredRequests();
    return visible.length > 0 && visible.every((request) => this.selectedRequests().has(request.id));
  });
  readonly someFilteredSelected = computed(() =>
    !this.allFilteredSelected() && this.filteredRequests().some((request) => this.selectedRequests().has(request.id)));

  ngOnInit(): void {
    this.loadUsers();
    this.loadAccessRequests();
  }

  /** Roles que se pueden asignar a este usuario (según quien administra y si es externo). */
  rolesFor(user: User): UserRole[] {
    return assignableRoles(this.actorRole(), user.is_institutional ?? true);
  }

  loadAccessRequests(status: 'PENDING' | 'REJECTED' = this.requestStatus()): void {
    if (status !== this.requestStatus()) this.requestSearch.set('');
    this.requestStatus.set(status);
    this.selectedRequests.set(new Set());
    this.userService.getAccessRequests(status).subscribe({
      next: (response) => {
        this.accessRequests.set(response.data);
        this.pendingCount.set(response.pending_count);
      },
      error: () => this.accessRequests.set([]),
    });
  }

  roleOf(requestId: number): UserRole {
    const chosen = this.requestRoles()[requestId];
    const allowed = this.requestableRoles();
    return chosen && allowed.includes(chosen) ? chosen : (allowed.includes('RECOLECTOR') ? 'RECOLECTOR' : allowed[allowed.length - 1]);
  }

  setRequestRole(requestId: number, role: UserRole): void {
    this.requestRoles.update((roles) => ({ ...roles, [requestId]: role }));
  }

  /** Asigna el mismo rol a todas las solicitudes seleccionadas. */
  setRoleForSelected(role: UserRole): void {
    if (!role) return;
    this.requestRoles.update((roles) => {
      const next = { ...roles };
      for (const request of this.selectedList()) next[request.id] = role;
      return next;
    });
  }

  toggleRequest(requestId: number, checked: boolean): void {
    this.selectedRequests.update((current) => {
      const next = new Set(current);
      if (checked) next.add(requestId);
      else next.delete(requestId);
      return next;
    });
  }

  /** Marca o desmarca todas las solicitudes visibles con la búsqueda actual. */
  toggleAllFiltered(checked: boolean): void {
    this.selectedRequests.update((current) => {
      const next = new Set(current);
      for (const request of this.filteredRequests()) {
        if (checked) next.add(request.id);
        else next.delete(request.id);
      }
      return next;
    });
  }

  /** Resumen de roles para el diálogo de confirmación: «3 Recolector, 1 Supervisor». */
  private roleSummary(requests: AccessRequest[]): string {
    const counts = new Map<UserRole, number>();
    for (const request of requests) counts.set(this.roleOf(request.id), (counts.get(this.roleOf(request.id)) ?? 0) + 1);
    return [...counts].map(([role, count]) => `${count} ${this.getRoleLabel(role)}`).join(', ');
  }

  approveSelected(): void {
    this.approveMany(this.selectedList());
  }

  /** Aprueba todas las solicitudes de la lista (las que coinciden con la búsqueda, si hay una). */
  approveAllFiltered(): void {
    this.approveMany(this.filteredRequests());
  }

  private approveMany(requests: AccessRequest[]): void {
    if (requests.length === 0 || this.bulkBusy()) return;
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: requests.length === 1 ? this.translate.instant('users.page.msg.approveOne') : this.translate.instant('users.page.msg.approveMany', { count: requests.length }),
        message: this.translate.instant('users.page.msg.approveMessage', { roles: this.roleSummary(requests) }),
        confirmText: this.translate.instant('users.page.requests.approve'),
        cancelText: this.translate.instant('common.buttons.cancel'),
      },
    }).afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.bulkBusy.set(true);
      this.userService.approveAccessRequests(requests.map((request) => ({ id: request.id, rol: this.roleOf(request.id) }))).subscribe({
        next: (response) => {
          this.notify.success(response.message);
          this.bulkBusy.set(false);
          this.loadAccessRequests();
          this.loadUsers(this.currentPage());
        },
        error: (err) => {
          this.notify.error(err.error?.message || this.translate.instant('users.page.msg.approveManyFailed'));
          this.bulkBusy.set(false);
        },
      });
    });
  }

  rejectSelected(): void {
    const requests = this.selectedList();
    if (requests.length === 0 || this.bulkBusy()) return;
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant(requests.length === 1 ? 'users.page.msg.rejectOneTitle' : 'users.page.msg.rejectManyTitle', { count: requests.length }),
        message: this.translate.instant('users.page.msg.rejectManyMessage'),
        confirmText: this.translate.instant('users.page.requests.reject'),
        cancelText: this.translate.instant('common.buttons.cancel'),
        confirmColor: 'warn',
      },
    }).afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.bulkBusy.set(true);
      this.userService.rejectAccessRequests(requests.map((request) => request.id)).subscribe({
        next: (response) => {
          this.notify.success(response.message);
          this.bulkBusy.set(false);
          this.loadAccessRequests();
        },
        error: (err) => {
          this.notify.error(err.error?.message || this.translate.instant('users.page.msg.rejectManyFailed'));
          this.bulkBusy.set(false);
        },
      });
    });
  }

  approveRequest(request: AccessRequest): void {
    const rol = this.roleOf(request.id);
    this.busyRequest.set(request.id);
    this.userService.approveAccessRequest(request.id, rol).subscribe({
      next: (response) => {
        this.notify.success(response.message);
        this.busyRequest.set(null);
        this.loadAccessRequests();
        this.loadUsers(this.currentPage());
      },
      error: (err) => {
        this.notify.error(err.error?.message || this.translate.instant('users.page.msg.approveFailed'));
        this.busyRequest.set(null);
      },
    });
  }

  rejectRequest(request: AccessRequest): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant('users.page.msg.rejectOneTitle'),
        message: this.translate.instant('users.page.msg.rejectOneMessage', { name: request.name, email: request.email }),
        confirmText: this.translate.instant('users.page.requests.reject'),
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
          this.notify.error(err.error?.message || this.translate.instant('users.page.msg.rejectFailed'));
          this.busyRequest.set(null);
        },
      });
    });
  }

  /** Restablece la vinculación con Microsoft cuando la persona ve «vinculado a otra cuenta de Microsoft». */
  unlinkMicrosoft(user: User): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant('users.page.unlinkMicrosoft'),
        message: this.translate.instant('users.page.msg.unlinkMessage', { name: user.name, email: user.email }),
        confirmText: this.translate.instant('users.page.msg.unlinkConfirm'),
        cancelText: this.translate.instant('common.buttons.cancel'),
      },
    }).afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.userService.unlinkMicrosoft(user.id).subscribe({
        next: (response) => {
          this.notify.success(response.message);
          this.users.update((users) => users.map((item) => (item.id === user.id ? { ...item, microsoft_linked: false } : item)));
        },
        error: (err) => this.notify.error(err.error?.message || this.translate.instant('users.page.msg.unlinkFailed')),
      });
    });
  }

  setUserView(view: 'active' | 'deleted'): void {
    if (this.userView() === view) return;
    this.userView.set(view);
    this.loadUsers(1);
  }

  restoreUser(user: User): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant('users.page.msg.restoreTitle'),
        message: this.translate.instant('users.page.msg.restoreMessage', { name: user.name, email: user.email, role: this.getRoleLabel(user.rol) }),
        confirmText: this.translate.instant('users.page.restore'),
        cancelText: this.translate.instant('common.buttons.cancel'),
      },
    }).afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.restoringUser.set(user.id);
      this.userService.restoreUser(user.id).subscribe({
        next: (response) => {
          this.notify.success(response.message);
          this.restoringUser.set(null);
          this.loadUsers(this.currentPage());
        },
        error: (err) => {
          this.notify.error(err.error?.message || this.translate.instant('users.page.msg.restoreFailed'));
          this.restoringUser.set(null);
        },
      });
    });
  }

  loadUsers(page = 1): void {
    this.loading.set(true);
    this.userService.getUsers(this.pageSize(), page, this.userView() === 'deleted').subscribe({
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
    const key = ROLE_LABELS[rol as UserRole];
    return key ? this.translate.instant(key) : rol;
  }

  readonly roleIcons: Record<UserRole, string> = {
    SUPER_ADMIN: 'workspace_premium', ADMIN: 'security', PROJECT: 'assignment_ind',
    SUPERVISOR: 'supervisor_account', RECOLECTOR: 'person',
  };

  getStatusBadgeClass(isActive: boolean): string {
    return isActive ? 'badge-active' : 'badge-inactive';
  }

  formatDate(date: string | null | undefined): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString();
  }
}

/** Texto comparable para la búsqueda: minúsculas y sin tildes. */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
