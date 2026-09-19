import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { UserRepository } from '../../repositories/user.repository';
import { User } from '../../../features/users/models/user.model';
import { environment } from '../../../../environments/environment';

interface BackendUser {
  id: number;
  name: string;
  email: string;
  rol: string;
  is_active: boolean;
  created_at: string;
}

interface UserListResponse {
  data: BackendUser[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

function mapDtoToUser(dto: BackendUser): User {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: dto.rol as User['role'],
    isActive: dto.is_active,
    createdAt: dto.created_at,
  };
}

@Injectable()
export class HttpUserAdapter implements UserRepository {
  private readonly baseUrl = `${environment.apiUrl}/users`;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<User[]> {
    return this.http
      .get<UserListResponse>(this.baseUrl)
      .pipe(map((res) => res.data.map(mapDtoToUser)));
  }

  findById(id: string): Observable<User | null> {
    return this.http
      .get<{ data: BackendUser }>(`${this.baseUrl}/${id}`)
      .pipe(map((res) => mapDtoToUser(res.data)));
  }

  create(user: Omit<User, 'id' | 'createdAt'>): Observable<User> {
    const body = {
      name: user.name,
      email: user.email,
      password: '12345678',
      rol: user.role,
    };

    return this.http
      .post<{ data: BackendUser }>(this.baseUrl, body)
      .pipe(map((res) => mapDtoToUser(res.data)));
  }

  update(id: string, changes: Partial<User>): Observable<User> {
    const body: Record<string, unknown> = {};

    if (changes.name !== undefined) body['name'] = changes.name;
    if (changes.email !== undefined) body['email'] = changes.email;
    if (changes.role !== undefined) body['rol'] = changes.role;

    return this.http
      .put<{ data: BackendUser }>(`${this.baseUrl}/${id}`, body)
      .pipe(map((res) => mapDtoToUser(res.data)));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
