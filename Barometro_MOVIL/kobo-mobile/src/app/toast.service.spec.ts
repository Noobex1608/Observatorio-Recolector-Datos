import { vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  afterEach(() => vi.useRealTimers());

  it('muestra avisos sin repetirlos y los cierra solos', () => {
    vi.useFakeTimers();
    const toast = new ToastService();
    toast.show('Guardado');
    toast.show('Guardado');
    toast.show('Sin conexión', 'error');
    expect(toast.toasts().map(t => t.message)).toEqual(['Guardado', 'Sin conexión']);
    vi.advanceTimersByTime(3600);
    expect(toast.toasts().map(t => t.message)).toEqual(['Sin conexión']);
    vi.advanceTimersByTime(3000);
    expect(toast.toasts()).toEqual([]);
  });

  it('confirm y prompt resuelven con la respuesta del diálogo', async () => {
    const toast = new ToastService();
    const accepted = toast.confirm({ title: 'Eliminar borrador', tone: 'danger' });
    expect(toast.dialog()?.tone).toBe('danger');
    toast.dialog()!.resolve(true);
    await expect(accepted).resolves.toBe(true);

    const url = toast.prompt({ title: 'Servidor', label: 'Dirección', value: 'https://a.test' });
    expect(toast.dialog()?.value).toBe('https://a.test');
    toast.dialog()!.resolve('https://b.test');
    await expect(url).resolves.toBe('https://b.test');

    const cancelled = toast.prompt({ title: 'Servidor', label: 'Dirección' });
    const replaced = toast.confirm({ title: 'Otro' });
    await expect(cancelled).resolves.toBeNull();
    toast.dialog()!.resolve(false);
    await expect(replaced).resolves.toBe(false);
    expect(toast.dialog()).toBeNull();
  });
});
