import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { QuestionType } from './db.service';

const TOKEN_KEY = 'kobo_token';

export interface LoginResponse {
  token: string;
  user: { id: number; name: string; email: string; rol: string };
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
}

export interface SubmitResponse {
  id: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  private buildUrl(servidor: string, path: string): string {
    const base = servidor.replace(/\/+$/, '');
    return `${base}/api/${path.replace(/^\//, '')}`;
  }

  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
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

  fetchForms(servidor: string): Promise<BackendForm[]> {
    const url = this.buildUrl(servidor, 'mobile/forms');
    return lastValueFrom(
      this.http.get<BackendForm[]>(url, { headers: this.getAuthHeaders() })
    );
  }

  fetchFormById(servidor: string, formId: string): Promise<BackendForm> {
    const url = this.buildUrl(servidor, `forms/${formId}`);
    return lastValueFrom(
      this.http.get<BackendForm>(url, { headers: this.getAuthHeaders() })
    );
  }

  submitResponse(servidor: string, linkUuid: string, data: Record<string, any>): Promise<SubmitResponse> {
    const url = this.buildUrl(servidor, `forms/submit/${linkUuid}`);
    return lastValueFrom(
      this.http.post<SubmitResponse>(url, { data }, {
        headers: this.getAuthHeaders()
      })
    );
  }

  logout(servidor: string): Promise<void> {
    const url = this.buildUrl(servidor, 'logout');
    return lastValueFrom(
      this.http.post<void>(url, {}, { headers: this.getAuthHeaders() })
    );
  }

  updateProfile(servidor: string, data: { name: string; telefono?: string; cargo?: string; bio?: string }): Promise<any> {
    const url = this.buildUrl(servidor, 'profile');
    return lastValueFrom(
      this.http.put(url, data, { headers: this.getAuthHeaders() })
    );
  }
}
