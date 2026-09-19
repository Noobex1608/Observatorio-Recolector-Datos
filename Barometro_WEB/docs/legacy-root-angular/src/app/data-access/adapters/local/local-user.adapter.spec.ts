import { firstValueFrom } from 'rxjs';
import { LocalUserAdapter } from './local-user.adapter';

describe('LocalUserAdapter', () => {
  it('crea, actualiza y elimina usuarios', async () => {
    const adapter = new LocalUserAdapter();

    const created = await firstValueFrom(
      adapter.create({
        name: 'Usuario Test',
        email: 'test@universidad.edu',
        role: 'USER',
        isActive: true,
      }),
    );

    const updated = await firstValueFrom(adapter.update(created.id, { role: 'PROJECT_LEADER' }));
    expect(updated.role).toBe('PROJECT_LEADER');

    await firstValueFrom(adapter.delete(created.id));
    const found = await firstValueFrom(adapter.findById(created.id));
    expect(found).toBeNull();
  });
});
