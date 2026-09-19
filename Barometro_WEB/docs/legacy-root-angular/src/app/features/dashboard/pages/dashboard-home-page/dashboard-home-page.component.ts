import { Component, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { DashboardFacade } from '../../services/dashboard.facade';
import { ReportsFacade } from '../../../reports/services/reports.facade';
import { KpiSummary } from '../../models/dashboard.model';
import { ReportDataset } from '../../../reports/models/report.model';

@Component({
  selector: 'app-dashboard-home-page',
  templateUrl: './dashboard-home-page.component.html',
  styleUrl: './dashboard-home-page.component.css',
})
export class DashboardHomePageComponent {
  private readonly dashboardFacade = inject(DashboardFacade);
  private readonly reportsFacade = inject(ReportsFacade);

  protected readonly loading = signal(false);
  protected readonly kpis = signal<KpiSummary | null>(null);
  protected readonly reportDataset = signal<ReportDataset[]>([]);

  protected readonly maxResponses = computed(() => {
    const values = this.reportDataset().map((item) => item.totalResponses);
    return values.length ? Math.max(...values) : 1;
  });

  constructor() {
    this.loadDashboard();
  }

  protected barWidth(value: number): number {
    return (value / this.maxResponses()) * 100;
  }

  protected completionColor(rate: number): string {
    if (rate >= 75) {
      return '#16a34a';
    }

    if (rate >= 40) {
      return '#ca8a04';
    }

    return '#dc2626';
  }

  private loadDashboard(): void {
    this.loading.set(true);
    this.dashboardFacade.getKpis().subscribe((data) => this.kpis.set(data));
    this.reportsFacade
      .getReport({})
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((data) => this.reportDataset.set(data));
  }
}
