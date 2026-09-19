import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Form {
  id: string;
  title: string;
  description?: string;
  project_id?: string | null;
  project?: { id: string; name: string };
  owner?: { id: string; name: string; email: string; rol?: string };
  state: 'DRAFT' | 'DEPLOYED' | 'ARCHIVED';
  link_uuid?: string;
  step_by_step?: boolean;
  responses_count?: number;
  created_at: string;
  updated_at: string;
  questions?: FormQuestion[];
  shares?: FormShare[];
  access_role?: 'PROJECT' | 'RECOLECTOR' | null;
}

export interface FormQuestion {
  id: string;
  form_id: string;
  type: 'MULTIPLE_CHOICE' | 'SINGLE_CHOICE' | 'LIKERT' | 'TEXT' | 'NUMBER';
  label: string;
  options?: string[] | LikertOptions | null;
  likert_rows?: string[] | null;
  likert_columns?: string[] | null;
  branch_rules?: FormQuestionBranchRule[] | null;
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

  createForm(data: { title: string; description?: string; project_id?: string | null; step_by_step?: boolean }): Observable<Form> {
    return this.http.post<Form>(this.apiUrl, data);
  }

  updateForm(id: string, data: Partial<Form>): Observable<Form> {
    return this.http.put<Form>(`${this.apiUrl}/${id}`, data);
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

  getResponses(id: string): Observable<{ questions: FormQuestion[]; responses: any[] }> {
    return this.http.get<{ questions: FormQuestion[]; responses: any[] }>(
      `${this.apiUrl}/${id}/responses`,
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

  fetchPublicForm(linkUuid: string): Observable<Form> {
    return this.http.get<Form>(`${this.apiUrl}/fetch/${linkUuid}`);
  }

  submitResponse(linkUuid: string, data: Record<string, unknown>): Observable<{ message: string; id: string }> {
    return this.http.post<{ message: string; id: string }>(`${this.apiUrl}/submit/${linkUuid}`, { data });
  }
}
