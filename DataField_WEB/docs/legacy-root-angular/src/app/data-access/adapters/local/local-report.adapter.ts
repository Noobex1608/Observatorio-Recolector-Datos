import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ReportRepository } from '../../repositories/report.repository';
import { KpiSummary } from '../../../features/dashboard/models/dashboard.model';
import { ReportDataset, ReportFilter } from '../../../features/reports/models/report.model';
import { SURVEYS_MOCK } from '../../mocks/surveys.mock';
import { RESPONSES_MOCK } from '../../mocks/responses.mock';

@Injectable()
export class LocalReportAdapter implements ReportRepository {
  getKpis(): Observable<KpiSummary> {
    const totalSurveys = SURVEYS_MOCK.length;
    const totalResponses = RESPONSES_MOCK.length;
    const activeSurveys = SURVEYS_MOCK.filter((survey) => survey.status === 'DEPLOYED').length;

    return of({
      totalSurveys,
      totalResponses,
      activeSurveys,
      completionRate: totalSurveys ? Number(((totalResponses / totalSurveys) * 100).toFixed(2)) : 0,
    });
  }

  getReport(filter: ReportFilter): Observable<ReportDataset[]> {
    const surveys = filter.surveyId
      ? SURVEYS_MOCK.filter((survey) => survey.id === filter.surveyId)
      : SURVEYS_MOCK;

    const dataset: ReportDataset[] = surveys.map((survey) => {
      const surveyResponses = RESPONSES_MOCK.filter((response) => response.surveyId === survey.id);

      return {
        surveyId: survey.id,
        totalResponses: surveyResponses.length,
        byQuestion: survey.questions.map((question) => ({
          questionId: question.id,
          questionLabel: question.label,
          answersCount: surveyResponses.filter((response) =>
            response.answers.some((answer) => answer.questionId === question.id),
          ).length,
        })),
      };
    });

    return of(dataset);
  }
}
