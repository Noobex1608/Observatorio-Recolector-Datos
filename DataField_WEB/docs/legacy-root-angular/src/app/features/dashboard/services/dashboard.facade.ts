import { inject, Injectable } from '@angular/core';
import { REPORT_REPOSITORY } from '../../../core/tokens/repository.tokens';
import { ReportRepository } from '../../../data-access/repositories/report.repository';

@Injectable({ providedIn: 'root' })
export class DashboardFacade {
  private readonly reportRepository = inject(REPORT_REPOSITORY) as ReportRepository;

  getKpis() {
    return this.reportRepository.getKpis();
  }
}
