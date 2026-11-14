import { inject, Injectable } from '@angular/core';
import { REPORT_REPOSITORY } from '../../../core/tokens/repository.tokens';
import { ReportRepository } from '../../../data-access/repositories/report.repository';
import { ReportFilter } from '../models/report.model';

@Injectable({ providedIn: 'root' })
export class ReportsFacade {
  private readonly reportRepository = inject(REPORT_REPOSITORY) as ReportRepository;

  getReport(filter: ReportFilter) {
    return this.reportRepository.getReport(filter);
  }
}
