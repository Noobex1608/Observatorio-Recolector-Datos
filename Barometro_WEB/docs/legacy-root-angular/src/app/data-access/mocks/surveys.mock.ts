import { Survey } from '../../features/surveys/models/survey.model';

export const SURVEYS_MOCK: Survey[] = [
  {
    id: 's-001',
    title: 'Satisfaccion Docente 2026',
    description: 'Encuesta institucional para estudiantes.',
    status: 'DEPLOYED',
    version: 1,
    createdBy: 'u-admin',
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    questions: [
      {
        id: 'q-001',
        type: 'LIKERT',
        label: 'Evalua la calidad de la docencia recibida.',
        required: true,
        order: 1,
        scaleMin: 1,
        scaleMax: 5,
        labels: {
          1: 'Muy baja',
          5: 'Muy alta',
        },
      },
      {
        id: 'q-002',
        type: 'TEXT',
        label: 'Comentarios adicionales',
        required: false,
        order: 2,
        maxLength: 500,
      },
    ],
  },
];
