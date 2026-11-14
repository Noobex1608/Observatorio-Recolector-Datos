import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { ReportDataset } from '../../models/report.model';
import { ReportsFacade } from '../../services/reports.facade';
import { ExportService } from '../../services/export.service';
import { SurveysFacade } from '../../../surveys/services/surveys.facade';
import { Survey } from '../../../surveys/models/survey.model';
import { ResponsesFacade } from '../../../responses/services/responses.facade';

@Component({
  selector: 'app-reports-home-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reports-home-page.component.html',
  styleUrl: './reports-home-page.component.css',
})
export class ReportsHomePageComponent {
  private readonly reportsFacade = inject(ReportsFacade);
  private readonly surveysFacade = inject(SurveysFacade);
  private readonly responsesFacade = inject(ResponsesFacade);
  private readonly exportService = inject(ExportService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly surveys = signal<Survey[]>([]);
  protected readonly dataset = signal<ReportDataset[]>([]);
  protected readonly filterForm = this.formBuilder.nonNullable.group({
    surveyId: [''],
  });

  protected readonly totalRows = computed(() =>
    this.dataset().reduce((acc, report) => acc + report.byQuestion.length, 0),
  );

  constructor() {
    this.loadSurveys();
    this.loadReport();
  }

  protected applyFilters(): void {
    this.loadReport();
  }

  protected exportReport(): void {
    this.exportService.exportReportToXlsx(this.dataset());
  }

  protected exportRawResponses(): void {
    this.responsesFacade.listAll().subscribe((responses) => {
      const surveyId = this.filterForm.getRawValue().surveyId;
      const filtered = surveyId ? responses.filter((item) => item.surveyId === surveyId) : responses;
      this.exportService.exportResponsesToXlsx(filtered, this.surveys(), 'respuestas_filtradas.xlsx');
    });
  }

  protected trackSurvey(_: number, survey: Survey): string {
    return survey.id;
  }

  protected trackQuestion(_: number, question: ReportDataset['byQuestion'][number]): string {
    return question.questionId;
  }

  private loadSurveys(): void {
    this.surveysFacade.list().subscribe((surveys) => this.surveys.set(surveys));
  }

  private loadReport(): void {
    this.loading.set(true);
    const surveyId = this.filterForm.getRawValue().surveyId;

    this.reportsFacade
      .getReport({ surveyId: surveyId || undefined })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((dataset) => this.dataset.set(dataset));
  }
}
