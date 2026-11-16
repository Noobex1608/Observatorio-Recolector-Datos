import { firstValueFrom } from 'rxjs';
import { LocalSurveyAdapter } from './local-survey.adapter';

describe('LocalSurveyAdapter', () => {
  it('crea y elimina formularios', async () => {
    const adapter = new LocalSurveyAdapter();

    const created = await firstValueFrom(
      adapter.create({
        title: 'Formulario Test',
        description: 'Desc',
        status: 'DRAFT',
        createdBy: 'u-admin',
        questions: [],
      }),
    );

    expect(created.id).toContain('s-');

    await firstValueFrom(adapter.delete(created.id));
    const found = await firstValueFrom(adapter.findById(created.id));
    expect(found).toBeNull();
  });

  it('duplica un formulario existente', async () => {
    const adapter = new LocalSurveyAdapter();
    const all = await firstValueFrom(adapter.list());

    const duplicated = await firstValueFrom(adapter.duplicate(all[0].id));
    expect(duplicated.title).toContain('(Copia)');
    expect(duplicated.status).toBe('DRAFT');
  });
});
