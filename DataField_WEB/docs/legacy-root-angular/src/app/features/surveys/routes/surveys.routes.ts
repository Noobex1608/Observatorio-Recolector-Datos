import { Routes } from '@angular/router';
import { SurveysListPageComponent } from '../pages/surveys-list-page/surveys-list-page.component';
import { SurveyBuilderPageComponent } from '../pages/survey-builder-page/survey-builder-page.component';
import { SurveyPreviewPageComponent } from '../pages/survey-preview-page/survey-preview-page.component';
import { SurveyDetailPageComponent } from '../pages/survey-detail-page/survey-detail-page.component';
import { unsavedChangesGuard } from '../../../core/guards/unsaved-changes.guard';

export const SURVEYS_ROUTES: Routes = [
  { path: '', component: SurveysListPageComponent },
  { path: 'new', component: SurveyBuilderPageComponent, canDeactivate: [unsavedChangesGuard] },
  { path: ':id/edit', component: SurveyBuilderPageComponent, canDeactivate: [unsavedChangesGuard] },
  { path: ':id/preview', component: SurveyPreviewPageComponent },
  { path: ':id', component: SurveyDetailPageComponent },
];
