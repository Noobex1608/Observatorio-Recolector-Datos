import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import { SURVEY_REPOSITORY } from '../../../core/tokens/repository.tokens';
import { SurveyRepository } from '../../../data-access/repositories/survey.repository';
import { FormShare } from '../models/survey.model';
import { mapDtoToShares } from '../../../data-access/mappers/survey.mapper';

@Injectable({ providedIn: 'root' })
export class SurveysFacade {
  private readonly surveyRepository = inject(SURVEY_REPOSITORY) as SurveyRepository;

  list() {
    return this.surveyRepository.list();
  }

  findById(id: string) {
    return this.surveyRepository.findById(id);
  }

  create(survey: Parameters<SurveyRepository['create']>[0]) {
    return this.surveyRepository.create(survey);
  }

  update(id: string, changes: Parameters<SurveyRepository['update']>[1]) {
    return this.surveyRepository.update(id, changes);
  }

  changeStatus(id: string, status: Parameters<SurveyRepository['changeStatus']>[1]) {
    return this.surveyRepository.changeStatus(id, status);
  }

  duplicate(id: string) {
    return this.surveyRepository.duplicate(id);
  }

  delete(id: string) {
    return this.surveyRepository.delete(id);
  }

  getShares(id: string) {
    return this.surveyRepository.getShares(id).pipe(
      map((data) => mapDtoToShares(data)),
    );
  }

  addShare(id: string, data: { email: string; role: string; targetResponses?: number | null }) {
    return this.surveyRepository.addShare(id, data);
  }

  removeShare(id: string, shareId: number) {
    return this.surveyRepository.removeShare(id, shareId);
  }

  updateShareTarget(id: string, shareId: number, targetResponses: number | null) {
    return this.surveyRepository.updateShareTarget(id, shareId, targetResponses);
  }
}
