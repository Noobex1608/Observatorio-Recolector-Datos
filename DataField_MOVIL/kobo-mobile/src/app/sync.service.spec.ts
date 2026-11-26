import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { DbService } from './db.service';
import { MediaStorageService } from './services/media-storage.service';
import { SyncService, avisoRetirados, esperaPorServidorOcupado } from './sync.service';
import { ToastService } from './toast.service';

/** Tabla en memoria con solo las consultas de Dexie que usa SyncService. */
function tabla<T extends Record<string, any>>(filas: T[], clave: keyof T = 'id') {
  const consulta = (campo: string, coincide: (valor: any) => boolean) => {
    const seleccion = () => filas.filter(f => coincide(f[campo]));
    let filtro: (f: T) => boolean = () => true;
    const q = {
      filter: (fn: (f: T) => boolean) => { filtro = fn; return q; },
      count: async () => seleccion().filter(filtro).length,
      toArray: async () => seleccion().filter(filtro).map(f => ({ ...f })),
      primaryKeys: async () => seleccion().filter(filtro).map(f => f[clave]),
      delete: async () => {
        const borrar = new Set(seleccion().filter(filtro));
        filas.splice(0, filas.length, ...filas.filter(f => !borrar.has(f)));
      },
    };
    return q;
  };
  return {
    filas,
    toArray: async () => [...filas],
    get: async (id: any) => filas.find(f => f[clave] === id),
    update: async (id: any, cambios: Partial<T>) => { const f = filas.find(x => x[clave] === id); if (f) Object.assign(f, cambios); },
    delete: async (id: any) => { const i = filas.findIndex(f => f[clave] === id); if (i >= 0) filas.splice(i, 1); },
    bulkDelete: async (ids: any[]) => { filas.splice(0, filas.length, ...filas.filter(f => !ids.includes(f[clave]))); },
    where: (campo: string) => ({
      equals: (v: any) => consulta(campo, x => x === v),
      anyOf: (vs: any[]) => consulta(campo, x => vs.includes(x)),
    }),
  };
}

describe('SyncService: formularios que el servidor ya no ofrece', () => {
  let db: any;
  let metadata: any[];

  beforeEach(() => {
    db = {
      forms: tabla([
        { id: 'vigente', title: 'Hogares', project_zones: [] },
        { id: 'archivado', title: 'Recinto electoral', project_zones: [] },
        { id: 'retirado-con-pendientes', title: 'Comercios', project_zones: [] },
      ]),
      responses: tabla([
        { id: 1, formId: 'vigente', estado: 'enviado' },
        { id: 2, formId: 'archivado', estado: 'enviado' },
        { id: 3, formId: 'archivado', estado: 'enviado' },
        { id: 4, formId: 'retirado-con-pendientes', estado: 'enviado' },
        { id: 5, formId: 'retirado-con-pendientes', estado: 'borrador' },
        { id: 6, formId: 'retirado-con-pendientes', estado: 'listo-para-enviar' },
      ]),
      mediaBlobs: tabla([
        { id: 10, responseId: 2 },
        { id: 11, responseId: 5 },
      ]),
      transaction: vi.fn(async (...args: any[]) => args[args.length - 1]()),
    };
    metadata = [{ id: 'vigente', title: 'Hogares', target_responses: null, responses_count: 1, zones_progress: [] }];
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: DbService, useValue: db },
        { provide: AuthService, useValue: { obtenerUrlServidor: () => 'https://api.test', esModoDemo: () => false } },
        { provide: ApiService, useValue: { fetchFormsMetadata: vi.fn(async () => metadata) } },
        { provide: MediaStorageService, useValue: {} },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('quita lo enviado de los formularios retirados y conserva borradores y pendientes', async () => {
    const resultado = await TestBed.inject(SyncService).actualizarAvance();

    expect(resultado).toEqual({ quitados: ['Recinto electoral'], conPendientes: ['Comercios'] });
    // El formulario sin nada pendiente se quita; el que tiene pendientes se conserva.
    expect(db.forms.filas.map((f: any) => f.id)).toEqual(['vigente', 'retirado-con-pendientes']);
    // Solo se borra lo enviado de los retirados: lo del formulario vigente y lo no enviado siguen.
    expect(db.responses.filas.map((r: any) => r.id)).toEqual([1, 5, 6]);
    expect(db.mediaBlobs.filas.map((m: any) => m.id)).toEqual([11]);
    expect(avisoRetirados(resultado)).toContain('«Recinto electoral» ya no está disponible');
    expect(avisoRetirados(resultado)).toContain('tienes encuestas sin enviar');
  });

  it('no toca nada cuando el servidor sigue ofreciendo todos los formularios', async () => {
    metadata = db.forms.filas.map((f: any) => ({ id: f.id, title: f.title, zones_progress: [] }));

    const resultado = await TestBed.inject(SyncService).actualizarAvance();

    expect(avisoRetirados(resultado)).toBeNull();
    expect(db.forms.filas).toHaveLength(3);
    expect(db.responses.filas).toHaveLength(6);
  });

  it('limpiarEnviados solo borra lo enviado de los formularios pedidos', async () => {
    const borradas = await TestBed.inject(SyncService).limpiarEnviados(['retirado-con-pendientes']);

    expect(borradas).toBe(1);
    expect(db.responses.filas.map((r: any) => r.id)).toEqual([1, 2, 3, 5, 6]);
  });
});

describe('SyncService: servidor ocupado (429)', () => {
  let db: any;
  let submit: ReturnType<typeof vi.fn>;
  let toast: { show: ReturnType<typeof vi.fn> };
  const ocupado = (retryAfter?: string) => ({ status: 429, headers: { get: (h: string) => (h === 'Retry-After' ? retryAfter ?? null : null) } });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    localStorage.setItem('kobo_account_scope', 'u1');
    db = {
      name: 'KoboMobileDB:u1',
      forms: tabla([{ id: 'f1', title: 'Hogares', project_zones: [], responses_count: 0 }]),
      responses: tabla([1, 2, 3].map(id => ({ id, formId: 'f1', link_uuid: 'l1', estado: 'listo-para-enviar', answers: {}, clientSubmissionId: `s${id}` }))),
      mediaBlobs: tabla([]),
      transaction: vi.fn(async (...args: any[]) => args[args.length - 1]()),
    };
    submit = vi.fn();
    toast = { show: vi.fn() };
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: DbService, useValue: db },
        { provide: AuthService, useValue: { obtenerUrlServidor: () => 'https://api.test', esModoDemo: () => false } },
        { provide: ApiService, useValue: { submitResponse: submit, fetchFormsMetadata: vi.fn(async () => [{ id: 'f1', title: 'Hogares', zones_progress: [] }]) } },
        { provide: MediaStorageService, useValue: {} },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    localStorage.removeItem('kobo_account_scope');
  });

  it('usa el Retry-After del servidor, con mínimo y máximo, y solo para 429/503', () => {
    expect(esperaPorServidorOcupado(ocupado('30'))).toBe(30);
    expect(esperaPorServidorOcupado(ocupado())).toBe(60);
    expect(esperaPorServidorOcupado(ocupado('1'))).toBe(15);
    expect(esperaPorServidorOcupado(ocupado('99999'))).toBe(600);
    expect(esperaPorServidorOcupado({ status: 503 })).toBe(60);
    expect(esperaPorServidorOcupado({ status: 422 })).toBeNull();
    expect(esperaPorServidorOcupado({ status: 0 })).toBeNull();
  });

  it('se detiene al primer 429, no lo cuenta como fallo y reintenta solo después de la espera', async () => {
    submit.mockResolvedValueOnce({ id: 'r1' }).mockRejectedValueOnce(ocupado('30'));
    const sync = TestBed.inject(SyncService);

    const resultado = await sync.enviarPendientes();

    expect(resultado).toEqual({ enviados: 1, fallos: 0, ocupadoSegundos: 30 });
    expect(submit).toHaveBeenCalledTimes(2); // la tercera ni se intentó
    expect(db.responses.filas.map((r: any) => [r.estado, r.errorEnvio])).toEqual([
      ['enviado', undefined], ['listo-para-enviar', undefined], ['listo-para-enviar', undefined],
    ]);

    // Durante la pausa, pulsar «Enviar» no vuelve a pegarle al servidor.
    expect((await sync.enviarPendientes()).ocupadoSegundos).toBeGreaterThan(0);
    expect(submit).toHaveBeenCalledTimes(2);

    submit.mockResolvedValue({ id: 'ok' });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(submit).toHaveBeenCalledTimes(4);
    expect(db.responses.filas.every((r: any) => r.estado === 'enviado')).toBe(true);
    expect(toast.show).toHaveBeenCalledWith('Se enviaron 2 encuestas que estaban en espera.');
  });
});
