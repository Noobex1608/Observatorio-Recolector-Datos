import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { vi } from 'vitest';
import { AppInstallService } from './app-install.service';

describe('AppInstallService', () => {
  let listeners: Record<string, (e: Event) => void>;

  function crear(opciones: { standalone?: boolean; userAgent?: string } = {}): AppInstallService {
    listeners = {};
    const ventanaFalsa = {
      navigator: { userAgent: opciones.userAgent ?? 'Mozilla/5.0 (Linux; Android 14) Chrome/130', platform: 'Linux', maxTouchPoints: 5 },
      matchMedia: (q: string) => ({ matches: !!opciones.standalone && q.includes('standalone') }),
      addEventListener: (tipo: string, fn: (e: Event) => void) => { listeners[tipo] = fn; },
    };
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView: ventanaFalsa } }],
    });
    const servicio = TestBed.inject(AppInstallService);
    servicio.iniciar();
    return servicio;
  }

  function eventoInstalacion(outcome: 'accepted' | 'dismissed') {
    return {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome }),
    };
  }

  beforeEach(() => localStorage.removeItem('pwa-install-pospuesto'));
  afterEach(() => TestBed.resetTestingModule());

  it('muestra el botón solo cuando el navegador permite instalar', () => {
    const servicio = crear();
    expect(servicio.mostrar()).toBe(false);

    const evento = eventoInstalacion('accepted');
    listeners['beforeinstallprompt'](evento as unknown as Event);

    expect(evento.preventDefault).toHaveBeenCalled();
    expect(servicio.mostrar()).toBe(true);
  });

  it('al aceptar la instalación el botón desaparece', async () => {
    const servicio = crear();
    const evento = eventoInstalacion('accepted');
    listeners['beforeinstallprompt'](evento as unknown as Event);

    await servicio.instalar();

    expect(evento.prompt).toHaveBeenCalled();
    expect(servicio.mostrar()).toBe(false);
  });

  it('se oculta al recibir appinstalled (instalada desde el menú del navegador)', () => {
    const servicio = crear();
    listeners['beforeinstallprompt'](eventoInstalacion('dismissed') as unknown as Event);
    listeners['appinstalled'](new Event('appinstalled'));
    expect(servicio.mostrar()).toBe(false);
  });

  it('no aparece si la app ya está abierta como app instalada', () => {
    const servicio = crear({ standalone: true });
    expect(listeners['beforeinstallprompt']).toBeUndefined();
    expect(servicio.mostrar()).toBe(false);
  });

  it('en iPhone con Safari muestra las instrucciones aunque no haya evento', () => {
    const servicio = crear({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1' });
    expect(servicio.esIos()).toBe(true);
    expect(servicio.mostrar()).toBe(true);
  });

  it('«Ahora no» lo oculta y lo recuerda en la siguiente visita', () => {
    const servicio = crear();
    listeners['beforeinstallprompt'](eventoInstalacion('dismissed') as unknown as Event);
    servicio.posponer();
    expect(servicio.mostrar()).toBe(false);

    TestBed.resetTestingModule();
    const otraVisita = crear();
    listeners['beforeinstallprompt'](eventoInstalacion('dismissed') as unknown as Event);
    expect(otraVisita.mostrar()).toBe(false);
  });
});
