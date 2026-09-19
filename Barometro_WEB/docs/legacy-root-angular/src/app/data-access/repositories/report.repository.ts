import { Observable } from 'rxjs';
import { KpiSummary } from '../../features/dashboard/models/dashboard.model';
import { ReportDataset, ReportFilter } from '../../features/reports/models/report.model';

export interface ReportRepository {
  getKpis(): Observable<KpiSummary>;
  getReport(filter: ReportFilter): Observable<ReportDataset[]>;
}
