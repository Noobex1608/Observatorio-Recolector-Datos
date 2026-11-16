import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { SurveyRepository } from '../../repositories/survey.repository';
import { Survey, SurveyStatus } from '../../../features/surveys/models/survey.model';

@Injectable()
export class SupabaseSurveyAdapter implements SurveyRepository {
  list(): Observable<Survey[]> {
    return throwError(() => new Error('SupabaseSurveyAdapter pendiente de implementacion.'));
  }

  findById(_id: string): Observable<Survey | null> {
    return throwError(() => new Error('SupabaseSurveyAdapter pendiente de implementacion.'));
  }

  create(_survey: Omit<Survey, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Observable<Survey> {
    return throwError(() => new Error('SupabaseSurveyAdapter pendiente de implementacion.'));
  }

  update(_id: string, _changes: Partial<Survey>): Observable<Survey> {
    return throwError(() => new Error('SupabaseSurveyAdapter pendiente de implementacion.'));
  }

  delete(_id: string): Observable<void> {
    return throwError(() => new Error('SupabaseSurveyAdapter pendiente de implementacion.'));
  }

  duplicate(_id: string): Observable<Survey> {
    return throwError(() => new Error('SupabaseSurveyAdapter pendiente de implementacion.'));
  }

  changeStatus(_id: string, _status: SurveyStatus): Observable<Survey> {
    return throwError(() => new Error('SupabaseSurveyAdapter pendiente de implementacion.'));
  }

  getShares(_id: string): Observable<unknown[]> {
    return throwError(() => new Error('SupabaseSurveyAdapter pendiente de implementacion.'));
  }

  addShare(_id: string, _data: { email: string; role: string; targetResponses?: number | null }): Observable<unknown> {
    return throwError(() => new Error('SupabaseSurveyAdapter pendiente de implementacion.'));
  }

  removeShare(_id: string, _shareId: number): Observable<void> {
    return throwError(() => new Error('SupabaseSurveyAdapter pendiente de implementacion.'));
  }

  updateShareTarget(_id: string, _shareId: number, _targetResponses: number | null): Observable<unknown> {
    return throwError(() => new Error('SupabaseSurveyAdapter pendiente de implementacion.'));
  }
}
