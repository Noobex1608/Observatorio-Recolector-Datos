import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, of } from 'rxjs';
import { ReportRepository } from '../../repositories/report.repository';
import { KpiSummary } from '../../../features/dashboard/models/dashboard.model';
import { ReportDataset, ReportFilter } from '../../../features/reports/models/report.model';
import { environment } from '../../../../environments/environment';

interface FormListResponse {
  my_forms: { id: string; responses_count?: number }[];
  shared_forms: { id: string; responses_count?: number }[];
}

@Injectable()
export class HttpReportAdapter implements ReportRepository {
  private readonly formsBaseUrl = `${environment.apiUrl}/forms`;

  constructor(private readonly http: HttpClient) {}

  getKpis(): Observable<KpiSummary> {
    return this.http.get<FormListResponse>(this.formsBaseUrl).pipe(
      map((res) => {
        const allForms = [...(res.my_forms ?? []), ...(res.shared_forms ?? [])];
        const totalSurveys = allForms.length;
        const totalResponses = allForms.reduce(
          (sum, f) => sum + (f.responses_count ?? 0),
          0,
        );

        return {
          totalSurveys,
          totalResponses,
          activeSurveys: totalSurveys,
          completionRate: totalSurveys
            ? Number(((totalResponses / totalSurveys) * 100).toFixed(2))
            : 0,
        };
      }),
    );
  }

  getReport(filter: ReportFilter): Observable<ReportDataset[]> {
    if (filter.surveyId) {
      return this.loadFormStats(filter.surveyId);
    }

    return this.http.get<FormListResponse>(this.formsBaseUrl).pipe(
      switchMap((res) => {
        const formIds = [
          ...(res.my_forms ?? []).map((f) => f.id),
          ...(res.shared_forms ?? []).map((f) => f.id),
        ];

        if (formIds.length === 0) {
          return of([]);
        }

        const requests = formIds.map((id) => this.loadFormStats(id));
        return requests.length === 1
          ? requests[0]
          : new Observable<ReportDataset[]>((observer) => {
              let results: ReportDataset[] = [];
              let completed = 0;

              for (const req of requests) {
                req.subscribe({
                  next: (data) => {
                    results = [...results, ...data];
                    completed++;
                    if (completed === requests.length) {
                      observer.next(results);
                      observer.complete();
                    }
                  },
                  error: (err) => observer.error(err),
                });
              }
            });
      }),
    );
  }

  private loadFormStats(formId: string): Observable<ReportDataset[]> {
    return this.http
      .get<Record<string, Record<string, number>>>(`${this.formsBaseUrl}/${formId}/stats`)
      .pipe(
        map((stats) => {
          let totalResponses = 0;

          const byQuestion = Object.entries(stats).map(([questionId, counts]) => {
            const answersCount = Object.values(counts).reduce((sum, c) => sum + c, 0);
            totalResponses = Math.max(totalResponses, answersCount);
            return {
              questionId,
              questionLabel: questionId,
              answersCount,
            };
          });

          return [
            {
              surveyId: formId,
              totalResponses,
              byQuestion,
            },
          ];
        }),
      );
  }
}
