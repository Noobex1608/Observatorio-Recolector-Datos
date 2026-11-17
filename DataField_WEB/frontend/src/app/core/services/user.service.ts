import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { UserRole } from '../models';
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

export interface AccessRequest {
  id: number;
  name: string;
  email: string;
  status: 'PENDING' | 'REJECTED';
  requested_at: string | null;
}

export interface AccessRequestsResponse {
  data: AccessRequest[];
  pending_count: number;
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
  /** Solicitudes de acceso: personas de ULEAM que entraron con Microsoft 365 sin estar registradas. */
  getAccessRequests(status: 'PENDING' | 'REJECTED' = 'PENDING'): Observable<AccessRequestsResponse> {
    return this.api.get<AccessRequestsResponse>('/users/access-requests', { status });
  }

  approveAccessRequest(userId: number, rol: UserRole): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/users/access-requests/${userId}/approve`, { rol });
  }

  rejectAccessRequest(userId: number): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/users/access-requests/${userId}/reject`, {});
  }

  /** Reenvía el correo de confirmación a un usuario externo que aún no confirma su cuenta. */
  resendInvitation(userId: number): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/users/${userId}/invitation`, {});
  }

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
