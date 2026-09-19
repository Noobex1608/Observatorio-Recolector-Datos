import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models';
import { Form } from './form.service';

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  created_by?: number | null;
  leaders?: Pick<User, 'id' | 'name' | 'email' | 'rol'>[];
  forms?: Form[];
  members?: ProjectMember[];
  forms_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectMember {
  user_id: number;
  name: string;
  email: string;
  role: 'PROJECT' | 'RECOLECTOR';
  scope: 'Proyecto' | 'Formulario';
  form_id?: string | null;
  form_title?: string | null;
}

export interface ProjectPayload {
  name: string;
  description?: string | null;
  leader_ids?: number[];
}

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/projects`;

  getProjects(): Observable<Project[]> {
    return this.http.get<Project[]>(this.apiUrl);
  }

  getProject(id: string): Observable<Project> {
    return this.http.get<Project>(`${this.apiUrl}/${id}`);
  }

  getProjectLeaders(): Observable<Array<Pick<User, 'id' | 'name' | 'email' | 'rol'>>> {
    return this.http.get<Array<Pick<User, 'id' | 'name' | 'email' | 'rol'>>>(`${this.apiUrl}/leaders`);
  }

  createProject(data: ProjectPayload): Observable<Project> {
    return this.http.post<Project>(this.apiUrl, data);
  }

  updateProject(id: string, data: Partial<ProjectPayload>): Observable<Project> {
    return this.http.put<Project>(`${this.apiUrl}/${id}`, data);
  }

  deleteProject(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
