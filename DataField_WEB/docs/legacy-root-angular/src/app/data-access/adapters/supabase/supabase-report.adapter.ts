import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { ReportRepository } from '../../repositories/report.repository';
import { KpiSummary } from '../../../features/dashboard/models/dashboard.model';
import { ReportDataset, ReportFilter } from '../../../features/reports/models/report.model';

@Injectable()
export class SupabaseReportAdapter implements ReportRepository {
  getKpis(): Observable<KpiSummary> {
    return throwError(() => new Error('SupabaseReportAdapter pendiente de implementacion.'));
  }

  getReport(_filter: ReportFilter): Observable<ReportDataset[]> {
    return throwError(() => new Error('SupabaseReportAdapter pendiente de implementacion.'));
  }
}
