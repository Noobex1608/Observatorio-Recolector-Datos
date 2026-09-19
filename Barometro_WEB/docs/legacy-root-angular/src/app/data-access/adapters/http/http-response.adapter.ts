import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, merge, of } from 'rxjs';
import { ResponseRepository } from '../../repositories/response.repository';
import { Response } from '../../../features/responses/models/response.model';
import { environment } from '../../../../environments/environment';

interface BackendResponse {
  id: string;
  form_id: string;
  user_id: number | null;
  data: Record<string, unknown>;
  created_at: string;
}

interface ResponsesListResponse {
  questions: unknown[];
  responses: BackendResponse[];
}

function mapDtoToResponse(dto: BackendResponse): Response {
  const answers = Object.entries(dto.data ?? {}).map(([questionId, value]) => ({
    questionId,
    value: value as string | number | string[],
  }));

  return {
    id: dto.id,
    surveyId: dto.form_id,
    answers,
    submittedAt: dto.created_at,
  };
}

@Injectable()
export class HttpResponseAdapter implements ResponseRepository {
  private readonly formsBaseUrl = `${environment.apiUrl}/forms`;

  constructor(private readonly http: HttpClient) {}

  submit(response: Omit<Response, 'id' | 'submittedAt'>): Observable<Response> {
    const data: Record<string, unknown> = {};
    for (const answer of response.answers) {
      data[answer.questionId] = answer.value;
    }

    return this.http
      .post<{ id: string }>(`${this.formsBaseUrl}/submit/${response.surveyId}`, { data })
      .pipe(
        map((res) => ({
          ...response,
          id: res.id,
          submittedAt: new Date().toISOString(),
        })),
      );
  }

  listBySurvey(surveyId: string): Observable<Response[]> {
    return this.http
      .get<ResponsesListResponse>(`${this.formsBaseUrl}/${surveyId}/responses`)
      .pipe(map((res) => res.responses.map(mapDtoToResponse)));
  }

  listAll(): Observable<Response[]> {
    return this.http.get<{ my_forms: { id: string }[]; shared_forms: { id: string }[] }>(
      `${this.formsBaseUrl}`,
    ).pipe(
      switchMap((res) => {
        const formIds = [
          ...(res.my_forms ?? []).map((f) => f.id),
          ...(res.shared_forms ?? []).map((f) => f.id),
        ];

        if (formIds.length === 0) {
          return of([] as Response[]);
        }

        const requests = formIds.map((id) => this.listBySurvey(id));
        return merge(...requests);
      }),
    );
  }
}
