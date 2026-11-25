import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../api.service';
import { AuthService } from '../auth.service';
import {
  MICROSOFT_CODE_DONE_KEY,
  MICROSOFT_CODE_IN_USE_KEY,
  MICROSOFT_ERROR_KEY,
  MICROSOFT_SERVER_KEY,
  MicrosoftCallbackComponent,
} from './microsoft-callback.component';

describe('Retorno de Microsoft en la PWA', () => {
  let exchange: ReturnType<typeof vi.fn>;
  let router: { navigate: ReturnType<typeof vi.fn> };

  /** Crea una copia de la página de retorno (Chrome en Android puede abrir dos). */
  function pagina() {
    // Sin createComponent: ese ciclo ejecuta ngOnInit solo; aquí cada prueba decide cuándo arranca cada copia.
    const instance = TestBed.runInInjectionContext(() => new MicrosoftCallbackComponent()) as any;
    instance.irAlInicio = vi.fn();
    return instance;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/auth/microsoft?code=codigo-1');
    localStorage.setItem(MICROSOFT_SERVER_KEY, 'http://localhost:8000');
    exchange = vi.fn();
    router = { navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: { exchangeMicrosoftCode: exchange } },
        {
          provide: AuthService,
          useValue: {
            guardarSesion: (token: string) => localStorage.setItem('kobo_token', token),
            obtenerToken: () => localStorage.getItem('kobo_token'),
          },
        },
        { provide: Router, useValue: router },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  const respuesta = { token: 't-1', user: { id: 1, name: 'Ana', email: 'ana@uleam.edu.ec', rol: 'RECOLECTOR' } };

  it('canjea el código una vez, guarda la sesión y limpia el flujo', async () => {
    exchange.mockResolvedValue(respuesta);
    const p = pagina();

    await p.ngOnInit();

    expect(exchange).toHaveBeenCalledWith('http://localhost:8000', 'codigo-1');
    expect(localStorage.getItem('kobo_token')).toBe('t-1');
    expect(p.irAlInicio).toHaveBeenCalled();
    expect(localStorage.getItem(MICROSOFT_SERVER_KEY)).toBeNull();
    expect(localStorage.getItem(MICROSOFT_CODE_IN_USE_KEY)).toBeNull();
  });

  it('la segunda copia no vuelve a canjear: espera la sesión de la primera y entra', async () => {
    let terminar!: (r: typeof respuesta) => void;
    exchange.mockReturnValue(new Promise(resolve => { terminar = resolve; }));
    const primera = pagina();
    const segunda = pagina();

    const p1 = primera.ngOnInit();
    window.history.replaceState(null, '', '/auth/microsoft?code=codigo-1');
    const p2 = segunda.ngOnInit();
    terminar(respuesta);
    await Promise.all([p1, p2]);

    expect(exchange).toHaveBeenCalledTimes(1);
    expect(primera.irAlInicio).toHaveBeenCalled();
    expect(segunda.irAlInicio).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('si el canje es rechazado pero la otra copia ya guardó la sesión, entra sin mostrar error', async () => {
    exchange.mockImplementation(async () => {
      localStorage.setItem('kobo_token', 't-otra');
      localStorage.setItem(MICROSOFT_CODE_DONE_KEY, 'codigo-1');
      throw new HttpErrorResponse({ status: 401, error: { message: 'El código expiró.' } });
    });
    const p = pagina();

    await p.ngOnInit();

    expect(p.irAlInicio).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(MICROSOFT_ERROR_KEY)).toBeNull();
  });

  it('un error real vuelve al login con el mensaje del servidor', async () => {
    exchange.mockRejectedValue(new HttpErrorResponse({ status: 401, error: { message: 'El código de inicio de sesión expiró.' } }));
    const p = pagina();

    await p.ngOnInit();

    expect(router.navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
    expect(sessionStorage.getItem(MICROSOFT_ERROR_KEY)).toBe('El código de inicio de sesión expiró.');
    expect(localStorage.getItem(MICROSOFT_CODE_IN_USE_KEY)).toBeNull();
  });
});
