import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { ReportDataset } from '../../models/report.model';
import { ReportsFacade } from '../../services/reports.facade';

@Component({
  selector: 'app-report-detail-page',
  imports: [RouterLink],
  templateUrl: './report-detail-page.component.html',
  styleUrl: './report-detail-page.component.css',
})
export class ReportDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly reportsFacade = inject(ReportsFacade);

  protected readonly surveyId = this.route.snapshot.paramMap.get('surveyId') ?? '';
  protected readonly loading = signal(false);
  protected readonly report = signal<ReportDataset | null>(null);

  constructor() {
    if (!this.surveyId) {
      return;
    }

    this.loading.set(true);
    this.reportsFacade
      .getReport({ surveyId: this.surveyId })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((dataset) => this.report.set(dataset[0] ?? null));
  }
}
