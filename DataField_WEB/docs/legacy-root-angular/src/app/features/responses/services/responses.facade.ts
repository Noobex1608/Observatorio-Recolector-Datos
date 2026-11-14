import { inject, Injectable } from '@angular/core';
import { RESPONSE_REPOSITORY } from '../../../core/tokens/repository.tokens';
import { ResponseRepository } from '../../../data-access/repositories/response.repository';
import { Answer } from '../models/response.model';

@Injectable({ providedIn: 'root' })
export class ResponsesFacade {
  private readonly responseRepository = inject(RESPONSE_REPOSITORY) as ResponseRepository;

  submit(surveyId: string, answers: Answer[]) {
    return this.responseRepository.submit({ surveyId, answers });
  }

  listAll() {
    return this.responseRepository.listAll();
  }
}
