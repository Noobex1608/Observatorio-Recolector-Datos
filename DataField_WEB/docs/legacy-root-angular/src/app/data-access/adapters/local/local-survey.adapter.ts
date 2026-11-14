import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { SurveyRepository } from '../../repositories/survey.repository';
import { Survey, SurveyStatus } from '../../../features/surveys/models/survey.model';
import { SURVEYS_MOCK } from '../../mocks/surveys.mock';

@Injectable()
export class LocalSurveyAdapter implements SurveyRepository {
  private readonly surveys: Survey[] = structuredClone(SURVEYS_MOCK);

  list(): Observable<Survey[]> {
    return of([...this.surveys]);
  }

  findById(id: string): Observable<Survey | null> {
    return of(this.surveys.find((survey) => survey.id === id) ?? null);
  }

  create(survey: Omit<Survey, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Observable<Survey> {
    const now = new Date().toISOString();
    const created: Survey = {
      ...survey,
      id: `s-${crypto.randomUUID()}`,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.surveys.unshift(created);
    return of(created);
  }

  update(id: string, changes: Partial<Survey>): Observable<Survey> {
    const index = this.surveys.findIndex((survey) => survey.id === id);

    if (index < 0) {
      return throwError(() => new Error('Formulario no encontrado'));
    }

    const updated: Survey = {
      ...this.surveys[index],
      ...changes,
      updatedAt: new Date().toISOString(),
    };

    this.surveys[index] = updated;
    return of(updated);
  }

  delete(id: string): Observable<void> {
    const index = this.surveys.findIndex((survey) => survey.id === id);
    if (index >= 0) {
      this.surveys.splice(index, 1);
    }
    return of(void 0);
  }

  duplicate(id: string): Observable<Survey> {
    const original = this.surveys.find((survey) => survey.id === id);

    if (!original) {
      return throwError(() => new Error('Formulario no encontrado'));
    }

    const now = new Date().toISOString();
    const duplicate: Survey = {
      ...structuredClone(original),
      id: `s-${crypto.randomUUID()}`,
      title: `${original.title} (Copia)`,
      status: 'DRAFT',
      version: original.version + 1,
      createdAt: now,
      updatedAt: now,
    };

    this.surveys.unshift(duplicate);
    return of(duplicate);
  }

  changeStatus(id: string, status: SurveyStatus): Observable<Survey> {
    return this.update(id, { status });
  }

  getShares(): Observable<unknown[]> {
    return of([]);
  }

  addShare(): Observable<unknown> {
    return of({});
  }

  removeShare(): Observable<void> {
    return of(void 0);
  }

  updateShareTarget(): Observable<unknown> {
    return of({});
  }
}
