import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { User, Role } from '../../models/user.model';
import { UsersFacade } from '../../services/users.facade';

@Component({
  selector: 'app-users-list-page',
  imports: [RouterLink],
  templateUrl: './users-list-page.component.html',
  styleUrl: './users-list-page.component.css',
})
export class UsersListPageComponent {
  private readonly usersFacade = inject(UsersFacade);

  protected readonly users = signal<User[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  constructor() {
    this.loadUsers();
  }

  protected deleteUser(user: User): void {
    const confirmed = globalThis.confirm(
      `¿Seguro que deseas eliminar al usuario "${user.name}"? Esta acción no se puede deshacer.`,
    );

    if (!confirmed) {
      return;
    }

    this.usersFacade.delete(user.id).subscribe({
      next: () => this.loadUsers(),
      error: () => this.error.set('No fue posible eliminar el usuario.'),
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

  private loadUsers(): void {
    this.loading.set(true);
    this.error.set('');

    this.usersFacade.list().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No fue posible cargar los usuarios.');
        this.loading.set(false);
      },
    });
  }
}
