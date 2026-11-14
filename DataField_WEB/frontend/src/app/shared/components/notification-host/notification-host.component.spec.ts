import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { NotificationService } from '@core/services/notification.service';
import { NotificationHostComponent } from './notification-host.component';

describe('Notificaciones del sistema', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('muestra cada tipo en su región, sin repetir mensajes y con un máximo de cuatro', () => {
    const notify = TestBed.inject(NotificationService);
    notify.success('Guardado');
    notify.success('Guardado');
    notify.error('Falló');
    notify.info('a');
    notify.warning('b');
    notify.info('c');

    expect(notify.notifications().map((item) => item.message)).toEqual(['Falló', 'a', 'b', 'c']);

    const fixture = TestBed.createComponent(NotificationHostComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[aria-live="assertive"]')?.textContent).toContain('Falló');
    expect(element.querySelector('[aria-live="polite"]')?.textContent).toContain('a');
  });

  it('se cierran solas, pausan con el puntero y se cierran con el botón', async () => {
    vi.useFakeTimers();
    const notify = TestBed.inject(NotificationService);
    const fixture = TestBed.createComponent(NotificationHostComponent);
    const host = fixture.componentInstance;
    notify.success('Hecho');
    fixture.detectChanges();
    await fixture.whenStable();

    const item = notify.notifications()[0];
    host.pause(item);
    vi.advanceTimersByTime(10000);
    expect(notify.notifications()).toHaveLength(1);
    host.resume(item);
    vi.advanceTimersByTime(4000);
    expect(notify.notifications()).toHaveLength(0);

    notify.error('Persistente');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.toast-close') as HTMLButtonElement).click();
    expect(notify.notifications()).toHaveLength(0);
  });

  it('el diálogo de confirmación resuelve según la respuesta', async () => {
    const notify = TestBed.inject(NotificationService);
    const fixture = TestBed.createComponent(NotificationHostComponent);

    const first = notify.confirm({ title: 'Eliminar', message: '¿Seguro?', tone: 'danger' });
    fixture.detectChanges();
    const dialog: HTMLElement = fixture.nativeElement.querySelector('[role="alertdialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.classList).toContain('confirm-dialog--danger');
    (fixture.nativeElement.querySelector('.confirm-btn--primary') as HTMLButtonElement).click();
    await expect(first).resolves.toBe(true);

    const second = notify.confirm({ title: 'Salir', message: 'Hay cambios' });
    const third = notify.confirm({ title: 'Otra', message: 'Reemplaza a la anterior' });
    await expect(second).resolves.toBe(false);
    fixture.componentInstance.answer(false);
    await expect(third).resolves.toBe(false);
    expect(notify.confirmation()).toBeNull();
  });
});
