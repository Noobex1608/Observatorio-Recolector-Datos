import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Form {
  draft_revision?: number;
  instrument_locked?: boolean;
  id: string;
  title: string;
  description?: string;
  project_id?: string | null;
  project?: { id: string; name: string };
  owner?: { id: string; name: string; email: string; rol?: string };
  state: 'DRAFT' | 'DEPLOYED' | 'ARCHIVED';
  link_uuid?: string;
  step_by_step?: boolean;
  require_consent?: boolean;
  consent_text?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  responses_count?: number;
  created_at: string;
  updated_at: string;
  questions?: FormQuestion[];
  shares?: FormShare[];
  technical_sheet?: { status: string } | null;
  project_zones?: Array<{ id: string; name: string; target_lat: number | null; target_lng: number | null; radius_meters: number; geometry_json: unknown }>;
  access_role?: 'PROJECT' | 'RECOLECTOR' | null;
}

export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'SINGLE_CHOICE'
  | 'LIKERT'
  | 'TEXT'
  | 'NUMBER'
  | 'NOTE'
  | 'DATE'
  | 'TIME'
  | 'DATETIME'
  | 'GPS'
  | 'MULTIMEDIA'
  | 'SIGNATURE'
  | 'RANKING'
  | 'RATING'
  | 'BARCODE'
  | 'CALCULATE';

export interface FormQuestionProperties {
  help_text?: string;
  text_format?: 'email' | 'cedula_ec' | 'telefono_ec' | null;
  min_date?: string;
  max_date?: string;
  default_now?: boolean;
  capture_accuracy?: boolean;
  allow_manual_fallback?: boolean;
  target_lat?: number | null;
  target_lng?: number | null;
  radius_meters?: number | null;
  zone_name?: string | null;
  geofencing?: {
    name: string;
    lat: number | null;
    lng: number | null;
    radius: number;
  } | null;
  allowed_media?: 'image' | 'audio' | 'video' | 'both' | 'all';
  max_file_size_mb?: number;
  pen_color?: string;
  background_color?: string;
  max_rating?: number;
  icon_type?: 'star' | 'number';
  allowed_formats?: 'QR' | 'BARCODE' | 'ALL';
  allow_manual_input?: boolean;
  expression?: string;
}

export interface FormQuestion {
  id: string;
  form_id: string;
  type: QuestionType;
  label: string;
  options?: string[] | LikertOptions | null;
  likert_rows?: string[] | null;
  likert_columns?: string[] | null;
  branch_rules?: FormQuestionBranchRule[] | null;
  properties?: FormQuestionProperties | null;
  required: boolean;
  order: number;
  section_name?: string | null;
  parent_question_id?: string | null;
}

export interface FormQuestionBranchRule {
  option_index: number;
  action?: 'CONTINUE' | 'GO_TO' | 'END_FORM';
  next_question_id: string | null;
}

export interface LikertOptions {
  rows: string[];
  columns: string[];
}

export interface FormShare {
  id: string;
  form_id: string;
  user_id: string;
  role: 'PROJECT' | 'RECOLECTOR';
  target_responses?: number | null;
  responses_count?: number;
  user_name?: string;
  user_email?: string;
  user_rol?: string;
  user?: { id: string; name: string; email: string };
}

@Injectable({
  providedIn: 'root',
})
export class FormService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/forms`;

  getForms(): Observable<{ my_forms: Form[]; shared_forms: Form[] }> {
    return this.http.get<{ my_forms: Form[]; shared_forms: Form[] }>(this.apiUrl);
  }

  getForm(id: string): Observable<Form> {
    return this.http.get<Form>(`${this.apiUrl}/${id}`);
  }

  createForm(data: {
    title: string;
    description?: string;
    project_id?: string | null;
    step_by_step?: boolean;
    require_consent?: boolean;
    consent_text?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  }): Observable<Form> {
    return this.http.post<Form>(this.apiUrl, data);
  }

  updateForm(id: string, data: Partial<Form>): Observable<Form> {
    return this.http.put<Form>(`${this.apiUrl}/${id}`, data);
  }

  saveDraft(id: string, data: Omit<Partial<Form>, 'questions'> & { expected_revision: number; questions: Partial<FormQuestion>[] }): Observable<Form> {
    return this.http.put<Form>(`${this.apiUrl}/${id}/draft`, data);
  }

  deleteForm(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  cloneForm(id: string): Observable<Form> {
    return this.http.post<Form>(`${this.apiUrl}/${id}/clone`, {});
  }

  deployForm(id: string): Observable<Form> {
    return this.http.post<Form>(`${this.apiUrl}/${id}/deploy`, {});
  }

  archiveForm(id: string): Observable<Form> {
    return this.http.post<Form>(`${this.apiUrl}/${id}/archive`, {});
  }

  createQuestion(formId: string, data: Partial<FormQuestion>): Observable<FormQuestion> {
    return this.http.post<FormQuestion>(`${this.apiUrl}/${formId}/questions`, data);
  }

  updateQuestion(questionId: string, data: Partial<FormQuestion>): Observable<FormQuestion> {
    return this.http.put<FormQuestion>(`${this.apiUrl}/questions/${questionId}`, data);
  }

  deleteQuestion(questionId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/questions/${questionId}`);
  }

  getShares(formId: string): Observable<FormShare[]> {
    return this.http.get<FormShare[]>(`${this.apiUrl}/${formId}/shares`);
  }

  createShare(formId: string, data: { email: string; role: 'PROJECT' | 'RECOLECTOR'; target_responses?: number | null }): Observable<FormShare> {
    return this.http.post<FormShare>(`${this.apiUrl}/${formId}/shares`, data);
  }

  updateShareTarget(formId: string, shareId: string, target_responses: number | null): Observable<FormShare> {
    return this.http.patch<FormShare>(`${this.apiUrl}/${formId}/shares/${shareId}`, { target_responses });
  }

  deleteShare(formId: string, shareId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${formId}/shares/${shareId}`);
  }

  getResponses(id: string, page = 1): Observable<{ questions: FormQuestion[]; responses: any[]; pagination?: { current_page: number; last_page: number; total: number } }> {
    return this.http.get<{ questions: FormQuestion[]; responses: any[]; pagination?: { current_page: number; last_page: number; total: number } }>(
      `${this.apiUrl}/${id}/responses`, { params: new HttpParams().set('page', page).set('per_page', 50) },
    );
  }

  getResponseMediaUrl(formId: string, responseId: string, questionId: string): Observable<{ url: string; expires_in: number }> {
    return this.http.get<{ url: string; expires_in: number }>(
      `${this.apiUrl}/${formId}/responses/${responseId}/media/${questionId}`,
    );
  }

  getStats(id: string): Observable<Record<string, Record<string, number>>> {
    return this.http.get<Record<string, Record<string, number>>>(`${this.apiUrl}/${id}/stats`);
  }

  exportResponses(id: string, format: 'csv' | 'xlsx'): Observable<Blob> {
    const params = new HttpParams().set('format', format);
    return this.http.get(`${this.apiUrl}/${id}/export`, {
      params,
      responseType: 'blob',
    });
  }

  logExport(id: string, format: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.apiUrl}/${id}/log-export`, { format });
  }

  fetchPublicForm(linkUuid: string): Observable<Form> {
    return this.http.get<Form>(`${this.apiUrl}/fetch/${linkUuid}`);
  }

  submitResponse(linkUuid: string, data: Record<string, unknown>, clientSubmissionId: string): Observable<{ message: string; id: string }> {
    return this.http.post<{ message: string; id: string }>(`${this.apiUrl}/submit/${linkUuid}`, { data, client_submission_id: clientSubmissionId });
  }
}
