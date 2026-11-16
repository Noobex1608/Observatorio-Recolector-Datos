import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import {
  AUTH_REPOSITORY,
  REPORT_REPOSITORY,
  RESPONSE_REPOSITORY,
  SURVEY_REPOSITORY,
  USER_REPOSITORY,
} from './core/tokens/repository.tokens';
import { HttpAuthAdapter } from './data-access/adapters/http/http-auth.adapter';
import { HttpUserAdapter } from './data-access/adapters/http/http-user.adapter';
import { HttpSurveyAdapter } from './data-access/adapters/http/http-survey.adapter';
import { HttpResponseAdapter } from './data-access/adapters/http/http-response.adapter';
import { HttpReportAdapter } from './data-access/adapters/http/http-report.adapter';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor, errorInterceptor])),
    { provide: AUTH_REPOSITORY, useClass: HttpAuthAdapter },
    { provide: USER_REPOSITORY, useClass: HttpUserAdapter },
    { provide: SURVEY_REPOSITORY, useClass: HttpSurveyAdapter },
    { provide: RESPONSE_REPOSITORY, useClass: HttpResponseAdapter },
    { provide: REPORT_REPOSITORY, useClass: HttpReportAdapter },
  ],
};
