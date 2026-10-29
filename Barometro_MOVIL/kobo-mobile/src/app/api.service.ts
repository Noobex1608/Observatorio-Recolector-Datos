import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { QuestionType } from './db.service';

const TOKEN_KEY = 'kobo_token';
const SERVER_KEY = 'kobo_server_url';

export interface LoginResponse {
  token: string;
  user: { id: number; name: string; email: string; rol: string; must_change_password?: boolean };
}

export interface BranchRule {
  option_index: number;
  action?: 'CONTINUE' | 'GO_TO' | 'END_FORM';
  next_question_id?: string | null;
}

export interface BackendProjectZone {
  id: string;
  name: string;
  description?: string;
  geofence_type: 'radius' | 'manzana_polygon' | 'custom_polygon';
  target_lat: number | null;
  target_lng: number | null;
  radius_meters: number;
  hierarchy_json?: any;
  geometry_json?: any;
  /** Meta de encuestas de la zona (null = sin meta). */
  target_responses?: number | null;
  /** Encuestas que el servidor ya recibió para la zona, al último dato descargado. */
  responses_count?: number;
}

export interface BackendForm {
  id: string;
  title: string;
  description?: string;
  link_uuid: string;
  state: string;
  questions: BackendQuestion[];
  target_responses?: number;
  responses_count?: number;
  step_by_step?: boolean;
  require_consent?: boolean;
  consent_text?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  project_id?: string;
  project_name?: string;
  project_zones?: BackendProjectZone[];
}

export interface BackendFormMetadata {
  id: string;
  title: string;
  target_responses?: number | null;
  responses_count?: number | null;
  zones_progress?: Array<{ id: string; target_responses: number | null; responses_count: number }>;
}

export interface BackendQuestion {
  id: string;
  type: QuestionType;
  label: string;
  options?: string[];
  required: boolean;
  order: number;
  likert_rows?: string[];
  likert_columns?: string[];
  branch_rules?: BranchRule[];
  properties?: Record<string, any>;
  hint?: string;
  calculation_expression?: string;
  media_type?: 'IMAGE' | 'AUDIO' | 'VIDEO';
  section_name?: string | null;
  parent_question_id?: string | null;
}

export interface SubmitResponse {
  id: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  private buildUrl(servidor: string, path: string): string {
    const parsed = new URL(servidor);
    const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (parsed.protocol !== 'https:' && !(localDevelopment && parsed.protocol === 'http:')) {
      throw new Error('El servidor debe usar HTTPS. HTTP solo se admite en desarrollo local.');
    }
    const base = parsed.toString().replace(/\/+$/, '');
    return `${base}/api/${path.replace(/^\//, '')}`;
  }

  private getAuthHeaders(servidor: string): Record<string, string> {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
      const authenticatedServer = localStorage.getItem(SERVER_KEY);
      if (!authenticatedServer || new URL(authenticatedServer).toString().replace(/\/+$/, '') !== new URL(servidor).toString().replace(/\/+$/, '')) {
        throw new Error('La sesión pertenece a otro servidor. Vuelve a iniciar sesión.');
      }
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  login(servidor: string, email: string, password: string): Promise<LoginResponse> {
    const url = this.buildUrl(servidor, 'login');
    return lastValueFrom(
      this.http.post<LoginResponse>(url, { email, password }, {
        headers: { Accept: 'application/json' }
      })
    );
  }

  changeTemporaryPassword(servidor: string, token: string, currentPassword: string, password: string): Promise<unknown> {
    return lastValueFrom(this.http.post(this.buildUrl(servidor, 'change-password'), {
      current_password: currentPassword, password, password_confirmation: password,
    }, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } }));
  }

  fetchForms(servidor: string): Promise<BackendForm[]> {
    const url = this.buildUrl(servidor, 'mobile/forms');
    return lastValueFrom(
      this.http.get<BackendForm[]>(url, { headers: this.getAuthHeaders(servidor) })
    );
  }

  /** Lista liviana (sin preguntas ni geometrías): títulos, cuotas y avance por zona. */
  fetchFormsMetadata(servidor: string): Promise<BackendFormMetadata[]> {
    const url = this.buildUrl(servidor, 'mobile/forms/metadata');
    return lastValueFrom(
      this.http.get<BackendFormMetadata[]>(url, { headers: this.getAuthHeaders(servidor) })
    );
  }

  fetchFormById(servidor: string, formId: string): Promise<BackendForm> {
    const url = this.buildUrl(servidor, `forms/${formId}`);
    return lastValueFrom(
      this.http.get<BackendForm>(url, { headers: this.getAuthHeaders(servidor) })
    );
  }

  submitResponse(servidor: string, linkUuid: string, data: Record<string, any>, clientSubmissionId: string): Promise<SubmitResponse> {
    const url = this.buildUrl(servidor, 'mobile/submit');
    return lastValueFrom(
      this.http.post<SubmitResponse>(url, { link_uuid: linkUuid, data, client_submission_id: clientSubmissionId }, {
        headers: this.getAuthHeaders(servidor)
      })
    );
  }

  logout(servidor: string): Promise<void> {
    const url = this.buildUrl(servidor, 'logout');
    return lastValueFrom(
      this.http.post<void>(url, {}, { headers: this.getAuthHeaders(servidor) })
    );
  }

  updateProfile(servidor: string, data: { name: string; telefono?: string; cargo?: string; bio?: string }): Promise<any> {
    const url = this.buildUrl(servidor, 'profile');
    return lastValueFrom(
      this.http.put(url, data, { headers: this.getAuthHeaders(servidor) })
    );
  }
}
