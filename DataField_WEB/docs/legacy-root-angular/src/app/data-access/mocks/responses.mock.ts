import { Response } from '../../features/responses/models/response.model';

export const RESPONSES_MOCK: Response[] = [
  {
    id: 'r-001',
    surveyId: 's-001',
    submittedAt: '2026-02-10T12:30:00.000Z',
    answers: [
      { questionId: 'q-001', value: 4 },
      { questionId: 'q-002', value: 'Buena experiencia general.' },
    ],
  },
];
