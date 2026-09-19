import { Routes } from '@angular/router';
import { ReportsHomePageComponent } from '../pages/reports-home-page/reports-home-page.component';
import { ReportDetailPageComponent } from '../pages/report-detail-page/report-detail-page.component';

export const REPORTS_ROUTES: Routes = [
  { path: '', component: ReportsHomePageComponent },
  { path: ':surveyId', component: ReportDetailPageComponent },
];
