import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { UserRepository } from '../../repositories/user.repository';
import { User } from '../../../features/users/models/user.model';

@Injectable()
export class SupabaseUserAdapter implements UserRepository {
  list(): Observable<User[]> {
    return throwError(() => new Error('SupabaseUserAdapter pendiente de implementacion.'));
  }

  findById(_id: string): Observable<User | null> {
    return throwError(() => new Error('SupabaseUserAdapter pendiente de implementacion.'));
  }

  create(_user: Omit<User, 'id' | 'createdAt'>): Observable<User> {
    return throwError(() => new Error('SupabaseUserAdapter pendiente de implementacion.'));
  }

  update(_id: string, _changes: Partial<User>): Observable<User> {
    return throwError(() => new Error('SupabaseUserAdapter pendiente de implementacion.'));
  }

  delete(_id: string): Observable<void> {
    return throwError(() => new Error('SupabaseUserAdapter pendiente de implementacion.'));
  }
}
