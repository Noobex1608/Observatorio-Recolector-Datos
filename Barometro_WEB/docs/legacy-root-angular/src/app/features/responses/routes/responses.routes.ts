import { Routes } from '@angular/router';
import { ResponseFillPageComponent } from '../pages/response-fill-page/response-fill-page.component';
import { ResponsesListPageComponent } from '../pages/responses-list-page/responses-list-page.component';
import { ResponseSuccessPageComponent } from '../pages/response-success-page/response-success-page.component';

export const RESPONSES_ROUTES: Routes = [
  { path: '', component: ResponsesListPageComponent },
  { path: 'fill/:surveyId', component: ResponseFillPageComponent },
  { path: 'success', component: ResponseSuccessPageComponent },
];
