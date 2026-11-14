import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ResponseRepository } from '../../repositories/response.repository';
import { Response } from '../../../features/responses/models/response.model';
import { RESPONSES_MOCK } from '../../mocks/responses.mock';

@Injectable()
export class LocalResponseAdapter implements ResponseRepository {
  private readonly responses: Response[] = structuredClone(RESPONSES_MOCK);

  submit(response: Omit<Response, 'id' | 'submittedAt'>): Observable<Response> {
    const created: Response = {
      ...response,
      id: `r-${crypto.randomUUID()}`,
      submittedAt: new Date().toISOString(),
    };

    this.responses.unshift(created);
    return of(created);
  }

  listBySurvey(surveyId: string): Observable<Response[]> {
    return of(this.responses.filter((response) => response.surveyId === surveyId));
  }

  listAll(): Observable<Response[]> {
    return of([...this.responses]);
  }
}
