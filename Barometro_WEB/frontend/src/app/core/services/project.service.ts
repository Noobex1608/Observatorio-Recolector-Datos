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
  delegates?: Pick<User, 'id' | 'name' | 'email' | 'rol'>[];
  supervisors?: Pick<User, 'id' | 'name' | 'email' | 'rol'>[];
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
  role: 'PROJECT' | 'DELEGADO' | 'SUPERVISOR' | 'RECOLECTOR';
  scope: 'Proyecto' | 'Formulario';
  form_id?: string | null;
  form_title?: string | null;
}

export interface ProjectPayload {
  name: string;
  description?: string | null;
  leader_ids?: number[];
  delegate_ids?: number[];
  supervisor_ids?: number[];
}

export interface ProjectTechnicalSheet {
  id?: string;
  project_id?: string;
  form_id?: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  target_sample_size?: number | null;
  status: 'DRAFT' | 'VALIDATED' | 'IN_PROGRESS' | 'COMPLETED';
  validated_by?: number | null;
  validator?: { id: number; name: string; email: string };
  validated_at?: string | null;
  created_by?: number | null;
  creator?: { id: number; name: string; email: string };
  zones?: ProjectZone[];
  created_at?: string;
  updated_at?: string;
}

export interface ProjectZone {
  id?: string;
  project_id: string;
  form_id?: string | null;
  technical_sheet_id?: string | null;
  name: string;
  description?: string | null;
  geofence_type: 'radius' | 'manzana_polygon' | 'custom_polygon';
  target_lat?: number | null;
  target_lng?: number | null;
  radius_meters?: number;
  hierarchy_json?: {
    provincia?: string;
    canton?: string;
    parroquia?: string;
    sector?: string;
    manzana?: string;
  } | null;
  geometry_json?: any;
  target_responses?: number | null;
  assigned_count?: number | null;
  assigned_users?: Array<{
    id: number;
    name: string;
    email: string;
    role: string;
  }>;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectZonePayload {
  form_id?: string;
  name: string;
  description?: string | null;
  geofence_type?: 'radius' | 'manzana_polygon' | 'custom_polygon';
  target_lat?: number | null;
  target_lng?: number | null;
  radius_meters?: number;
  hierarchy_json?: any;
  geometry_json?: any;
  target_responses?: number | null;
  assigned_count?: number | null;
  assigned_user_ids?: number[];
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

  getAssignableUsers(projectId: string): Observable<Array<Pick<User, 'id' | 'name' | 'email' | 'rol'>>> {
    return this.http.get<Array<Pick<User, 'id' | 'name' | 'email' | 'rol'>>>(`${this.apiUrl}/${projectId}/assignable-users`);
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

  // Ficha técnica vinculada a cada formulario.
  getFormTechnicalSheet(formId: string): Observable<ProjectTechnicalSheet> {
    return this.http.get<ProjectTechnicalSheet>(`${environment.apiUrl}/forms/${formId}/technical-sheet`);
  }

  saveFormTechnicalSheet(formId: string, data: Partial<ProjectTechnicalSheet>): Observable<ProjectTechnicalSheet> {
    return this.http.post<ProjectTechnicalSheet>(`${environment.apiUrl}/forms/${formId}/technical-sheet`, data);
  }

  validateFormTechnicalSheet(formId: string): Observable<ProjectTechnicalSheet> {
    return this.http.post<ProjectTechnicalSheet>(`${environment.apiUrl}/forms/${formId}/technical-sheet/validate`, {});
  }

  // Zonas de Levantamiento
  getProjectZones(projectId: string, formId?: string): Observable<ProjectZone[]> {
    return this.http.get<ProjectZone[]>(`${this.apiUrl}/${projectId}/zones`, {
      params: formId ? { form_id: formId } : {},
    });
  }

  createProjectZone(projectId: string, data: ProjectZonePayload): Observable<ProjectZone> {
    return this.http.post<ProjectZone>(`${this.apiUrl}/${projectId}/zones`, data);
  }

  updateProjectZone(projectId: string, zoneId: string, data: Partial<ProjectZonePayload>): Observable<ProjectZone> {
    return this.http.put<ProjectZone>(`${this.apiUrl}/${projectId}/zones/${zoneId}`, data);
  }

  deleteProjectZone(projectId: string, zoneId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${projectId}/zones/${zoneId}`);
  }

  bulkAssignZones(projectId: string, assignments: Array<{ zone_id: string; user_ids: number[] }>): Observable<ProjectZone[]> {
    return this.http.post<ProjectZone[]>(`${this.apiUrl}/${projectId}/zones/bulk-assign`, { assignments });
  }

  randomAssignZones(projectId: string, formId: string, userIds: number[], seed: string | null, dryRun: boolean): Observable<{ seed: string; dry_run: boolean; assignments: Record<string, number[]> }> {
    return this.http.post<{ seed: string; dry_run: boolean; assignments: Record<string, number[]> }>(`${this.apiUrl}/${projectId}/zones/random-assign`, {
      form_id: formId, user_ids: userIds, seed, dry_run: dryRun,
    });
  }

  getMonitor(projectId: string, formId: string): Observable<FieldMonitor> {
    return this.http.get<FieldMonitor>(`${this.apiUrl}/${projectId}/monitor`, { params: { form_id: formId } });
  }
}

export interface FieldMonitor {
  form_id: string;
  zones: Array<{ id: string; name: string; geofence_type: string; target_lat: number | null; target_lng: number | null; radius_meters: number; geometry_json: unknown; assigned_user_ids: number[] }>;
  collectors: Array<{ id: number; name: string; active: boolean; last_position: { latitude: number; longitude: number; accuracy_meters: number | null; recorded_at: string; zone_id: string } | null }>;
}
