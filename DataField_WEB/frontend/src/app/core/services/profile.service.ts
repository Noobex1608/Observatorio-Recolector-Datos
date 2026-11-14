import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { User } from '@core/models';
import { environment } from '../../../environments/environment';

export interface UpdateProfileData {
  name?: string;
  telefono?: string;
  cargo?: string;
  bio?: string;
}

export interface ProfileResponse {
  success: boolean;
  message?: string;
  data: User;
}

@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/profile`;

  /**
   * Obtener perfil del usuario autenticado
   */
  getProfile(): Observable<User> {
    return this.http
      .get<ProfileResponse>(this.apiUrl)
      .pipe(map((response) => response.data));
  }

  /**
   * Actualizar perfil del usuario
   */
  updateProfile(data: UpdateProfileData): Observable<User> {
    return this.http
      .put<ProfileResponse>(this.apiUrl, data)
      .pipe(map((response) => response.data));
  }

  /**
   * Subir avatar del usuario
   */
  uploadAvatar(file: File): Observable<User> {
    const formData = new FormData();
    formData.append('avatar', file);

    return this.http
      .post<ProfileResponse>(`${this.apiUrl}/avatar`, formData)
      .pipe(map((response) => response.data));
  }

  /**
   * Eliminar avatar del usuario
   */
  deleteAvatar(): Observable<User> {
    return this.http
      .delete<ProfileResponse>(`${this.apiUrl}/avatar`)
      .pipe(map((response) => response.data));
  }
}
