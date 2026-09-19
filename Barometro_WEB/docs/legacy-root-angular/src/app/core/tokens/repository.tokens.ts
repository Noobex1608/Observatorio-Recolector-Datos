import { InjectionToken } from '@angular/core';
import { AuthRepository } from '../../data-access/repositories/auth.repository';
import { UserRepository } from '../../data-access/repositories/user.repository';
import { SurveyRepository } from '../../data-access/repositories/survey.repository';
import { ResponseRepository } from '../../data-access/repositories/response.repository';
import { ReportRepository } from '../../data-access/repositories/report.repository';

export const AUTH_REPOSITORY = new InjectionToken<AuthRepository>('AUTH_REPOSITORY');
export const USER_REPOSITORY = new InjectionToken<UserRepository>('USER_REPOSITORY');
export const SURVEY_REPOSITORY = new InjectionToken<SurveyRepository>('SURVEY_REPOSITORY');
export const RESPONSE_REPOSITORY = new InjectionToken<ResponseRepository>('RESPONSE_REPOSITORY');
export const REPORT_REPOSITORY = new InjectionToken<ReportRepository>('REPORT_REPOSITORY');
