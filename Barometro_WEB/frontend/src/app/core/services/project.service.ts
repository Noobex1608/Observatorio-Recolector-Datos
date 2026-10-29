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

export interface CollectorPage {
  data: ProjectCollector[];
  pagination: { current_page: number; last_page: number; per_page: number; total: number };
}

export interface CollectorCandidate {
  id: number;
  name: string;
  email: string;
  cedula: string | null;
}

export interface ProjectCollector {
  id: number;
  name: string;
  email: string;
  cedula: string;
  is_active: boolean;
  form_ids: string[];
}

export interface CollectorImportRow {
  row: number;
  cedula: string;
  name: string;
  email: string;
  status: 'nuevo' | 'existente';
  errors: string[];
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
    manzanas?: string[];
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

  getCollectors(projectId: string): Observable<ProjectCollector[]> {
    return this.http.get<ProjectCollector[]>(`${this.apiUrl}/${projectId}/collectors`);
  }

  /** Una página del equipo del proyecto, con búsqueda por nombre, correo o cédula. */
  getCollectorPage(projectId: string, page: number, q = '', perPage = 25): Observable<CollectorPage> {
    return this.http.get<CollectorPage>(`${this.apiUrl}/${projectId}/collectors`, {
      params: { page, per_page: perPage, q },
    });
  }

  /** IDs de todos los encuestadores activos del proyecto que coinciden con la búsqueda. */
  getCollectorIds(projectId: string, q = ''): Observable<number[]> {
    return this.http.get<number[]>(`${this.apiUrl}/${projectId}/collectors/ids`, { params: { q } });
  }

  /** Usuarios encuestadores del sistema que aún no están en el proyecto. */
  getCollectorCandidates(projectId: string, q = ''): Observable<CollectorCandidate[]> {
    return this.http.get<CollectorCandidate[]>(`${this.apiUrl}/${projectId}/collectors/candidates`, { params: { q } });
  }

  attachCollectors(projectId: string, userIds: number[]): Observable<{ added: number }> {
    return this.http.post<{ added: number }>(`${this.apiUrl}/${projectId}/collectors/attach`, { user_ids: userIds });
  }

  getCollectorTemplate(projectId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${projectId}/collectors/template`, { responseType: 'blob' });
  }

  importCollectors(projectId: string, file: File, preview: boolean): Observable<{ rows?: CollectorImportRow[]; valid?: boolean; imported?: number; credentials?: Array<{ name: string; email: string; password: string }> }> {
    const body = new FormData();
    body.append('file', file);
    body.append('preview', preview ? '1' : '0');
    return this.http.post<{ rows?: CollectorImportRow[]; valid?: boolean; imported?: number; credentials?: Array<{ name: string; email: string; password: string }> }>(`${this.apiUrl}/${projectId}/collectors/import`, body);
  }

  updateCollector(projectId: string, userId: number, data: Partial<Pick<ProjectCollector, 'name' | 'email' | 'cedula' | 'is_active'>>): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/${projectId}/collectors/${userId}`, data);
  }

  removeCollector(projectId: string, userId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${projectId}/collectors/${userId}`);
  }

  assignCollectorForms(projectId: string, userIds: number[], formIds: string[]): Observable<{ assigned: number }> {
    return this.http.post<{ assigned: number }>(`${this.apiUrl}/${projectId}/collectors/assign-forms`, { user_ids: userIds, form_ids: formIds });
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

  // Ficha técnica única del proyecto (desde un formulario solo se consulta la de su proyecto).
  getProjectTechnicalSheet(projectId: string): Observable<ProjectTechnicalSheet> {
    return this.http.get<ProjectTechnicalSheet>(`${this.apiUrl}/${projectId}/technical-sheet`);
  }

  saveProjectTechnicalSheet(projectId: string, data: Partial<ProjectTechnicalSheet>): Observable<ProjectTechnicalSheet> {
    return this.http.post<ProjectTechnicalSheet>(`${this.apiUrl}/${projectId}/technical-sheet`, data);
  }

  validateProjectTechnicalSheet(projectId: string): Observable<ProjectTechnicalSheet> {
    return this.http.post<ProjectTechnicalSheet>(`${this.apiUrl}/${projectId}/technical-sheet/validate`, {});
  }

  getFormTechnicalSheet(formId: string): Observable<ProjectTechnicalSheet> {
    return this.http.get<ProjectTechnicalSheet>(`${environment.apiUrl}/forms/${formId}/technical-sheet`);
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

  /** Encuestadores del proyecto con su actividad (pestaña Supervisión). */
  getSupervisionCollectors(projectId: string, options: { formId?: string | null; q?: string; page?: number; perPage?: number } = {}): Observable<SupervisionCollectorPage> {
    const params: Record<string, string | number> = { page: options.page ?? 1, per_page: options.perPage ?? 25, q: options.q ?? '' };
    if (options.formId) params['form_id'] = options.formId;
    return this.http.get<SupervisionCollectorPage>(`${this.apiUrl}/${projectId}/supervision/collectors`, { params });
  }

  /** Recorrido GPS de un encuestador en un día: trazado de cada encuesta y verificación de zona. */
  getCollectorRoute(projectId: string, userId: number, options: { formId?: string | null; date?: string | null } = {}): Observable<CollectorRoute> {
    const params: Record<string, string> = {};
    if (options.formId) params['form_id'] = options.formId;
    if (options.date) params['date'] = options.date;
    return this.http.get<CollectorRoute>(`${this.apiUrl}/${projectId}/supervision/collectors/${userId}`, { params });
  }
}

export interface SupervisionCollector {
  id: number;
  name: string;
  email: string;
  cedula?: string | null;
  zones: string[];
  responses: number;
  traced: number;
  today: number;
  outside: number;
  last_activity: string | null;
}

export interface SupervisionCollectorPage {
  data: SupervisionCollector[];
  pagination: { current_page: number; last_page: number; per_page: number; total: number };
}

export interface RouteZone {
  id: string;
  name: string;
  form_id: string;
  geofence_type: string;
  target_lat: number | null;
  target_lng: number | null;
  radius_meters: number;
  geometry_json: unknown;
}

/** Momento de la encuesta en que la app tomó el punto GPS. */
export type RouteEvent = 'inicio' | 'reanudar' | 'fin';

/** [latitud, longitud, precisión, hora ISO, dentro de la zona (null = sin zona), lectura confiable, evento] */
export type RoutePoint = [number, number, number | null, string, boolean | null, boolean, RouteEvent | null];

export interface RouteAlert {
  code: 'sin_trazado' | 'excepcion_zona' | 'fuera_de_zona' | 'salio_de_zona' | 'duracion_corta' | 'desplazamiento' | 'gps_impreciso';
  message: string;
}

export interface RouteSurvey {
  id: string;
  form_id: string;
  form_title: string | null;
  zone: { id: string; name: string } | null;
  started_at: string;
  ended_at: string | null;
  received_at: string;
  has_trace: boolean;
  declared_outside: boolean;
  justification: string | null;
  /** Veces que se retomó el borrador. */
  resumed: number;
  summary: {
    points: number;
    distance_meters: number;
    duration_seconds: number | null;
    inside_ratio: number | null;
    start_inside: boolean | null;
    end_inside: boolean | null;
    average_accuracy: number | null;
  };
  alerts: RouteAlert[];
  path: RoutePoint[];
}

export interface CollectorRoute {
  collector: { id: number; name: string; email: string; cedula?: string | null };
  date: string;
  days: { date: string; surveys: number }[];
  forms: { id: string; title: string }[];
  zones: RouteZone[];
  summary: {
    surveys: number;
    with_trace: number;
    first_start: string | null;
    last_end: string | null;
    distance_meters: number;
    surveying_seconds: number;
    inside_ratio: number | null;
    alerts: number;
    outside_surveys: number;
  };
  surveys: RouteSurvey[];
}
