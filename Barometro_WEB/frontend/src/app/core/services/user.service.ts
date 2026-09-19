import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
    CreateUserRequest,
    UpdateUserRequest,
    UpdateUserRoleRequest,
    UpdateUserRoleResponse,
    UserDetailResponse,
    UsersListResponse
} from './interfaces';

export interface ToggleStatusResponse {
  message: string;
  data: any;
}

export interface DeleteUserResponse {
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly api = inject(ApiService);

  /**
   * Obtener lista de usuarios (solo admin)
   */
  getUsers(perPage = 15, page = 1): Observable<UsersListResponse> {
    return this.api.get<UsersListResponse>(`/users?per_page=${perPage}&page=${page}`);
  }

  /**
   * Obtener detalle de un usuario (solo admin)
   */
  getUserById(userId: number): Observable<UserDetailResponse> {
    return this.api.get<UserDetailResponse>(`/users/${userId}`);
  }

  /**
   * Crear un nuevo usuario (solo admin)
   */
  createUser(data: CreateUserRequest): Observable<UserDetailResponse> {
    return this.api.post<UserDetailResponse>('/users', data);
  }

  /**
   * Actualizar un usuario (solo admin)
   */
  updateUser(userId: number, data: UpdateUserRequest): Observable<UserDetailResponse> {
    return this.api.put<UserDetailResponse>(`/users/${userId}`, data);
  }

  /**
   * Eliminar un usuario (solo admin)
   */
  deleteUser(userId: number): Observable<DeleteUserResponse> {
    return this.api.delete<DeleteUserResponse>(`/users/${userId}`);
  }

  /**
   * Cambiar rol de un usuario (solo admin)
   */
  updateUserRole(userId: number, data: UpdateUserRoleRequest): Observable<UpdateUserRoleResponse> {
    return this.api.patch<UpdateUserRoleResponse>(`/users/${userId}/role`, data);
  }

  /**
   * Activar/Desactivar un usuario (solo admin)
   */
  toggleUserStatus(userId: number, isActive?: boolean): Observable<ToggleStatusResponse> {
    const body = isActive !== undefined ? { is_active: isActive } : {};
    return this.api.patch<ToggleStatusResponse>(`/users/${userId}/status`, body);
  }
}
