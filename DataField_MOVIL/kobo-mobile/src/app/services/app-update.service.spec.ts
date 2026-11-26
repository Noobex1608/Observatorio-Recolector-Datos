import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { AppUpdateService } from './app-update.service';

describe('AppUpdateService', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<unknown>;
  let sw: { isEnabled: boolean; versionUpdates: Subject<VersionEvent>; unrecoverable: Subject<unknown>; checkForUpdate: ReturnType<typeof vi.fn>; activateUpdate: ReturnType<typeof vi.fn> };
  let reload: ReturnType<typeof vi.fn>;

  function crear(enabled = true): AppUpdateService {
    versionUpdates = new Subject();
    unrecoverable = new Subject();
    sw = {
      isEnabled: enabled,
      versionUpdates,
      unrecoverable,
      checkForUpdate: vi.fn().mockResolvedValue(true),
      activateUpdate: vi.fn().mockResolvedValue(true),
    };
    reload = vi.fn();
    const documentFalso = { location: { reload }, visibilityState: 'visible', addEventListener: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: sw },
        { provide: DOCUMENT, useValue: documentFalso },
      ],
    });
    return TestBed.inject(AppUpdateService);
  }

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('avisa solo cuando la versión nueva está lista, sin recargar sola', () => {
    vi.useFakeTimers();
    const servicio = crear();
    servicio.iniciar();
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);

    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    expect(servicio.disponible()).toBe(false);

    versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    expect(servicio.disponible()).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('al pedir actualizar activa la versión nueva y recarga', async () => {
    const servicio = crear();
    servicio.iniciar();
    await servicio.actualizar();
    expect(sw.activateUpdate).toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('recarga si la caché quedó inservible', () => {
    const servicio = crear();
    servicio.iniciar();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'x' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('no hace nada sin service worker (desarrollo)', () => {
    const servicio = crear(false);
    servicio.iniciar();
    expect(sw.checkForUpdate).not.toHaveBeenCalled();
  });
});
