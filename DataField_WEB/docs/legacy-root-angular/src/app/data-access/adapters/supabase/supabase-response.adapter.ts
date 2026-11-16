import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { ResponseRepository } from '../../repositories/response.repository';
import { Response } from '../../../features/responses/models/response.model';

@Injectable()
export class SupabaseResponseAdapter implements ResponseRepository {
  submit(_response: Omit<Response, 'id' | 'submittedAt'>): Observable<Response> {
    return throwError(() => new Error('SupabaseResponseAdapter pendiente de implementacion.'));
  }

  listBySurvey(_surveyId: string): Observable<Response[]> {
    return throwError(() => new Error('SupabaseResponseAdapter pendiente de implementacion.'));
  }

  listAll(): Observable<Response[]> {
    return throwError(() => new Error('SupabaseResponseAdapter pendiente de implementacion.'));
  }
}
