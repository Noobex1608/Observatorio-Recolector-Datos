import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export type TrashType = 'projects' | 'forms' | 'zones' | 'responses';

export interface TrashItem {
  id: string;
  name: string;
  context: string | null;
  reason?: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  can_purge: boolean;
}

/** Una entrada del historial de correcciones de una respuesta. */
export interface ResponseCorrection {
  type: 'answer' | 'void' | 'restore' | 'collector';
  question_id?: string;
  question?: string;
  before?: unknown;
  after?: unknown;
  cleared?: Array<{ question_id: string; question: string; before: unknown }>;
  reason: string;
  by: string;
  at: string;
}

export interface CorrectedResponse {
  id: string;
  form_id: string;
  user_id: number | null;
  data: Record<string, unknown>;
  corrections: ResponseCorrection[] | null;
  created_at: string;
}

export interface CollectorOption {
  id: number;
  name: string;
  email: string;
  rol: string;
}

/** Centro de datos (solo superadministrador): papelera y correcciones de respuestas. */
@Injectable({ providedIn: 'root' })
export class DataCenterService {
  private readonly api = inject(ApiService);

  trash(type: TrashType): Observable<{ data: TrashItem[] }> {
    return this.api.get<{ data: TrashItem[] }>(`/data-center/trash/${type}`);
  }

  restore(type: TrashType, id: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/data-center/trash/${type}/${id}/restore`, {});
  }

  /** Un formulario exige `confirm` con su nombre exacto: se lleva todas sus respuestas y archivos. */
  purge(type: TrashType, id: string, confirm?: string): Observable<{ message: string }> {
    const query = confirm ? `?confirm=${encodeURIComponent(confirm)}` : '';
    return this.api.delete<{ message: string }>(`/data-center/trash/${type}/${id}${query}`);
  }

  correctAnswer(responseId: string, questionId: string, value: unknown, reason: string): Observable<{ message: string; data: CorrectedResponse }> {
    return this.api.patch<{ message: string; data: CorrectedResponse }>(`/data-center/responses/${responseId}/answer`, { question_id: questionId, value, reason });
  }

  voidResponse(responseId: string, reason: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/data-center/responses/${responseId}/void`, { reason });
  }

  collectors(responseId: string): Observable<{ data: CollectorOption[] }> {
    return this.api.get<{ data: CollectorOption[] }>(`/data-center/responses/${responseId}/collectors`);
  }

  reassignCollector(responseId: string, userId: number, reason: string): Observable<{ message: string; data: CorrectedResponse }> {
    return this.api.patch<{ message: string; data: CorrectedResponse }>(`/data-center/responses/${responseId}/collector`, { user_id: userId, reason });
  }
}
