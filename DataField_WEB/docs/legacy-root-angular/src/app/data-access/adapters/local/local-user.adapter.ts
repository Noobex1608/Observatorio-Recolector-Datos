import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { USERS_MOCK } from '../../mocks/users.mock';
import { UserRepository } from '../../repositories/user.repository';
import { User } from '../../../features/users/models/user.model';

@Injectable()
export class LocalUserAdapter implements UserRepository {
  private readonly users: User[] = structuredClone(USERS_MOCK);
  private nextId = 100;

  list(): Observable<User[]> {
    return of([...this.users]);
  }

  findById(id: number | string): Observable<User | null> {
    const numId = Number(id);
    return of(this.users.find((user) => user.id === numId) ?? null);
  }

  create(user: Omit<User, 'id' | 'createdAt'>): Observable<User> {
    const created: User = {
      ...user,
      id: this.nextId++,
      createdAt: new Date().toISOString(),
    };

    this.users.unshift(created);
    return of(created);
  }

  update(id: number | string, changes: Partial<User>): Observable<User> {
    const numId = Number(id);
    const index = this.users.findIndex((user) => user.id === numId);

    if (index < 0) {
      return throwError(() => new Error('Usuario no encontrado'));
    }

    const updated: User = { ...this.users[index], ...changes };
    this.users[index] = updated;
    return of(updated);
  }

  delete(id: number | string): Observable<void> {
    const numId = Number(id);
    const index = this.users.findIndex((user) => user.id === numId);

    if (index >= 0) {
      this.users.splice(index, 1);
    }

    return of(void 0);
  }
}
