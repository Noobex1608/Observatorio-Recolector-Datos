import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { SurveyRepository } from '../../repositories/survey.repository';
import { Survey, SurveyStatus } from '../../../features/surveys/models/survey.model';
import { environment } from '../../../../environments/environment';
import { mapDtoToSurvey, mapSurveyToDto } from '../../mappers/survey.mapper';

interface FormListResponse {
  my_forms: unknown[];
  shared_forms: unknown[];
}

@Injectable()
export class HttpSurveyAdapter implements SurveyRepository {
  private readonly baseUrl = `${environment.apiUrl}/forms`;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<Survey[]> {
    return this.http
      .get<FormListResponse>(this.baseUrl)
      .pipe(
        map((res) => {
          const all = [...(res.my_forms ?? []), ...(res.shared_forms ?? [])];
          return all.map((dto) => mapDtoToSurvey(dto));
        }),
      );
  }

  findById(id: string): Observable<Survey | null> {
    return this.http
      .get<unknown>(`${this.baseUrl}/${id}`)
      .pipe(map((dto) => mapDtoToSurvey(dto)));
  }

  create(survey: Omit<Survey, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Observable<Survey> {
    const body = {
      title: survey.title,
      description: survey.description,
      project_id: survey.projectId,
    };

    return this.http
      .post<unknown>(this.baseUrl, body)
      .pipe(map((dto) => mapDtoToSurvey(dto)));
  }

  update(id: string, changes: Partial<Survey>): Observable<Survey> {
    const body = mapSurveyToDto(changes as Survey);

    return this.http
      .put<unknown>(`${this.baseUrl}/${id}`, body)
      .pipe(map((dto) => mapDtoToSurvey(dto)));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  duplicate(id: string): Observable<Survey> {
    return this.findById(id).pipe(
      switchMap((survey) => {
        if (!survey) {
          throw new Error('Formulario no encontrado');
        }

        const body = {
          title: `${survey.title} (Copia)`,
          description: survey.description,
          project_id: survey.projectId,
        };

        return this.http
          .post<unknown>(this.baseUrl, body)
          .pipe(map((dto) => mapDtoToSurvey(dto)));
      }),
    );
  }

  changeStatus(id: string, status: SurveyStatus): Observable<Survey> {
    const endpoint = status === 'DEPLOYED' ? 'deploy' : status === 'ARCHIVED' ? 'archive' : null;

    if (!endpoint) {
      return this.update(id, { status });
    }

    return this.http
      .post<unknown>(`${this.baseUrl}/${id}/${endpoint}`, {})
      .pipe(map((dto) => mapDtoToSurvey(dto)));
  }

  getShares(id: string): Observable<unknown[]> {
    return this.http.get<unknown[]>(`${this.baseUrl}/${id}/shares`);
  }

  addShare(id: string, data: { email: string; role: string; targetResponses?: number | null }): Observable<unknown> {
    const body: Record<string, unknown> = { email: data.email, role: data.role };
    if (data.targetResponses != null) {
      body['target_responses'] = data.targetResponses;
    }
    return this.http.post<unknown>(`${this.baseUrl}/${id}/shares`, body);
  }

  removeShare(id: string, shareId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/shares/${shareId}`);
  }

  updateShareTarget(id: string, shareId: number, targetResponses: number | null): Observable<unknown> {
    return this.http.patch<unknown>(`${this.baseUrl}/${id}/shares/${shareId}`, {
      target_responses: targetResponses,
    });
  }
}
