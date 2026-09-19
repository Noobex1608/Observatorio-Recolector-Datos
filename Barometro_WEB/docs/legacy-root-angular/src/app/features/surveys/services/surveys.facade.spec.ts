import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SURVEY_REPOSITORY } from '../../../core/tokens/repository.tokens';
import { SurveysFacade } from './surveys.facade';

describe('SurveysFacade', () => {
  it('delegates delete al repositorio', async () => {
    const repository = {
      list: vi.fn(() => of([])),
      findById: vi.fn(() => of(null)),
      create: vi.fn(() => of({})),
      update: vi.fn(() => of({})),
      delete: vi.fn(() => of(void 0)),
      duplicate: vi.fn(() => of({})),
      changeStatus: vi.fn(() => of({})),
    };

    TestBed.configureTestingModule({
      providers: [SurveysFacade, { provide: SURVEY_REPOSITORY, useValue: repository }],
    });

    const facade = TestBed.inject(SurveysFacade);
    await new Promise<void>((resolve) => {
      facade.delete('s-1').subscribe(() => {
        expect(repository.delete).toHaveBeenCalledWith('s-1');
        resolve();
      });
    });
  });
});
