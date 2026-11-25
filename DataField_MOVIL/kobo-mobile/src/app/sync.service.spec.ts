import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { DbService } from './db.service';
import { MediaStorageService } from './services/media-storage.service';
import { SyncService, avisoRetirados } from './sync.service';

/** Tabla en memoria con solo las consultas de Dexie que usa SyncService. */
function tabla<T extends Record<string, any>>(filas: T[], clave: keyof T = 'id') {
  const consulta = (campo: string, coincide: (valor: any) => boolean) => {
    const seleccion = () => filas.filter(f => coincide(f[campo]));
    let filtro: (f: T) => boolean = () => true;
    const q = {
      filter: (fn: (f: T) => boolean) => { filtro = fn; return q; },
      count: async () => seleccion().filter(filtro).length,
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
