import { Observable } from 'rxjs';
import { Response } from '../../features/responses/models/response.model';

export interface ResponseRepository {
  submit(response: Omit<Response, 'id' | 'submittedAt'>): Observable<Response>;
  listBySurvey(surveyId: string): Observable<Response[]>;
  listAll(): Observable<Response[]>;
}
