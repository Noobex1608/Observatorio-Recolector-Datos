import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { BorradoresComponent } from './borradores/borradores.component';
import { DbService } from './db.service';
import { EnviadosComponent } from './enviados/enviados.component';
import { InicioComponent } from './inicio/inicio.component';
import { ListaEncuestasComponent } from './lista-encuestas/lista-encuestas.component';
import { ListoParaEnviarComponent } from './listo-para-enviar/listo-para-enviar.component';
import { LlenarEncuestaComponent } from './llenar-encuesta/llenar-encuesta.component';
import { LocationService } from './services/location.service';
import { StorageService } from './storage.service';
import { SyncService } from './sync.service';
import { ThemeService } from './theme.service';
import { ToastService } from './toast.service';

/** Espera a que terminen las promesas encadenadas de ngOnInit. */
const flush = async (times = 5) => {
  for (let i = 0; i < times; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

/** Tabla de Dexie simulada: devuelve `rows` en cualquier consulta. */
function fakeTable(rows: any[] = []) {
  const query = {
    equals: () => query,
    reverse: () => query,
    toArray: async () => rows,
    count: async () => rows.length,
    first: async () => rows[0],
    delete: async () => undefined,
  };
  return {
    where: () => query,
    toArray: async () => rows,
    count: async () => rows.length,
    get: async (id: string) => rows.find(row => row.id === id),
    add: vi.fn(async () => 1),
    update: vi.fn(async () => 1),
    delete: vi.fn(async () => undefined),
    bulkDelete: vi.fn(async () => undefined),
  };
}

function fakeDb(forms: any[] = [], responses: any[] = []) {
  return {
    forms: fakeTable(forms),
    responses: fakeTable(responses),
    mediaBlobs: fakeTable([]),
    transaction: vi.fn(async (...args: any[]) => args[args.length - 1]()),
  };
}

function setup<T>(component: Type<T>, providers: any[] = []) {
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const toast = { show: vi.fn() };
  TestBed.overrideComponent(component, { set: { template: '', imports: [] } });
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: router },
      { provide: ToastService, useValue: toast },
      { provide: ThemeService, useValue: { t: (key: string) => key, isDark: () => false } },
      ...providers,
    ],
  });
  const fixture = TestBed.createComponent(component);
  return { fixture, instance: fixture.componentInstance as any, router, toast };
}

describe('Pantallas de la app: carga inicial y navegación', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('Borradores carga los borradores y navega', async () => {
    const draft = { id: 4, formId: 'f1', estado: 'borrador' };
    const { instance, router } = setup(BorradoresComponent, [{ provide: DbService, useValue: fakeDb([], [draft]) }]);

    instance.ngOnInit();
    await flush();
    expect(instance.borradores).toEqual([draft]);

    instance.continuar(draft);
    instance.volver();
    expect(router.navigate).toHaveBeenCalledWith(['/llenar', 'f1'], { queryParams: { continue: 'true' } });
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('Enviados carga las respuestas enviadas y vuelve al inicio', async () => {
    const sent = { id: 1, formId: 'f1', estado: 'enviado' };
    const { instance, router } = setup(EnviadosComponent, [{ provide: DbService, useValue: fakeDb([], [sent]) }]);

    instance.ngOnInit();
    await flush();
    expect(instance.enviados).toEqual([sent]);
    expect(instance.obtenerClavesRespuestas({ a: 1, _location_trace: { points: [] } })).toEqual([{ key: 'a', val: '1' }]);

    instance.volver();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('Listo para enviar filtra los pendientes y vuelve al inicio', async () => {
    const storage = { obtenerFormularios: vi.fn(async () => [
      { id: 1, estado: 'listo-para-enviar' }, { id: 2, estado: 'borrador' },
    ]) };
    const { instance, router } = setup(ListoParaEnviarComponent, [
      { provide: StorageService, useValue: storage },
      { provide: SyncService, useValue: {} },
      { provide: AuthService, useValue: { esModoDemo: () => false } },
    ]);

    instance.ngOnInit();
    await flush();
    expect(instance.formularios.map((f: any) => f.id)).toEqual([1]);

    instance.volver();
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });

  it('Lista de encuestas actualiza el avance con conexión y abre solo las habilitadas', async () => {
    const sync = { actualizarAvance: vi.fn(async () => undefined) };
    const { instance, router } = setup(ListaEncuestasComponent, [
      { provide: DbService, useValue: fakeDb([{ id: 'f1', title: 'Hogares', questions: [] }]) },
      { provide: SyncService, useValue: sync },
      { provide: AuthService, useValue: { obtenerRol: () => 'RECOLECTOR' } },
    ]);

    instance.ngOnInit();
    await flush();
    expect(sync.actualizarAvance).toHaveBeenCalled();

    instance.irALlenar('f1', true);
    expect(router.navigate).not.toHaveBeenCalled();
    instance.irALlenar('f1', false);
    expect(router.navigate).toHaveBeenCalledWith(['/llenar', 'f1']);
  });

  describe('Inicio', () => {
    function inicio(syncOverrides: Record<string, unknown> = {}) {
      const auth = {
        obtenerUrlServidor: () => 'https://api.uleam.test',
        obtenerUsuario: () => 'Ana',
        esModoDemo: () => false,
        logout: vi.fn(),
      };
      const api = { logout: vi.fn(async () => undefined) };
      const sync = { cantidadPendientes: vi.fn(async () => 0), ...syncOverrides };
      const ctx = setup(InicioComponent, [
        { provide: DbService, useValue: fakeDb() },
        { provide: AuthService, useValue: auth },
        { provide: ApiService, useValue: api },
        { provide: SyncService, useValue: sync },
      ]);
      return { ...ctx, auth, api };
    }

    it('carga contadores y navega a cada sección', async () => {
      const { instance, router, toast } = inicio();
      instance.ngOnInit();
      await flush();
      expect(instance.nombreUsuario).toBe('Ana');

      instance.abrirSeccion('Listo para enviar');
      instance.abrirSeccion('Borradores');
      instance.abrirSeccion('Enviado');
      instance.abrirSeccion('Borrar formulario');
      instance.irAjustes();
      instance.irPerfil();
      await flush();

      for (const route of ['/listo-para-enviar', '/borradores', '/enviados', '/ajustes', '/perfil']) {
        expect(router.navigate).toHaveBeenCalledWith([route]);
      }
      expect(toast.show).toHaveBeenCalledWith('No hay formularios descargados para borrar.', 'info');
      instance.ngOnDestroy();
    });

    it('vuelve al login cuando el servidor responde 401', async () => {
      const unauthorized = async () => { throw { status: 401 }; };
      const { instance, router, auth } = inicio({
        obtenerFormulariosDisponibles: unauthorized,
        sincronizarFormularios: unauthorized,
        enviarPendientes: unauthorized,
        cantidadPendientes: vi.fn(async () => 2),
      });
      instance.isOnline = true;

      await instance.iniciarDescarga();
      instance.seleccionDescarga.add('f1');
      await instance.confirmarDescarga();
      await instance.enviarFormulariosAlServidor();

      expect(auth.logout).toHaveBeenCalledTimes(3);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('cierra sesión revocando el token en el servidor', async () => {
      const { instance, router, auth, api } = inicio();
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      await instance.cerrarSesion();

      expect(api.logout).toHaveBeenCalledWith('https://api.uleam.test');
      expect(auth.logout).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('Llenar encuesta', () => {
    const form = {
      id: 'f1', title: 'Hogares', link_uuid: 'l1', step_by_step: true,
      project_zones: [{ id: 'z1', name: 'Centro', geofence_type: 'radius', target_lat: -0.95, target_lng: -80.72, radius_meters: 500 }],
      questions: [
        { id: 'a', type: 'NUMBER', label: 'A', order: 0, required: false },
        { id: 'b', type: 'TEXT', label: 'B', order: 1, required: false },
        { id: 'c', type: 'NUMBER', label: 'C', order: 2, required: false },
        { id: 'total', type: 'CALCULATE', label: 'Total', order: 3, required: false, calculation_expression: '${a} + ${b} + ${c}' },
      ],
    };

    function llenar(params: Record<string, string> = { id: 'f1' }) {
      const db = fakeDb([form], []);
      const location = {
        getCurrentPosition: vi.fn(async () => ({ latitude: -0.95, longitude: -80.72, accuracy: 5, timestamp: new Date().toISOString() })),
        permissionStatus: () => 'granted',
      };
      const route = { snapshot: { paramMap: convertToParamMap(params), queryParamMap: convertToParamMap({}) } };
      const ctx = setup(LlenarEncuestaComponent, [
        { provide: DbService, useValue: db },
        { provide: LocationService, useValue: location },
        { provide: ActivatedRoute, useValue: route },
      ]);
      return { ...ctx, db, location };
    }

    it('sin identificador muestra el error de carga', async () => {
      const { instance } = llenar({});
      instance.ngOnInit();
      await flush();
      expect(instance.errorCarga).toBe('ID de formulario no válido.');
    });

    it('verifica la zona al abrir y calcula expresiones con números y texto', async () => {
      const { instance, location } = llenar();
      instance.ngOnInit();
      await flush(10);
      expect(location.getCurrentPosition).toHaveBeenCalled();

      instance.respuestas['a'] = 2;
      instance.respuestas['b'] = ' 3 ';
      instance.respuestas['c'] = Number.NaN;
      instance.evaluarCalculosBackground();
      expect(instance.respuestas['total']).toBe(5);

      instance.respuestas['b'] = 'texto';
      instance.evaluarCalculosBackground();
      expect(instance.respuestas['total']).toBe(2);
    });

    it('guarda borrador y encuesta y vuelve al inicio', async () => {
      const { instance, router, db } = llenar();
      instance.ngOnInit();
      await flush(10);

      await instance.guardarBorrador();
      await instance.guardarFormulario();

      expect(db.responses.add).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('no deja avanzar ni enviar con una cédula inválida, aunque sea opcional', async () => {
      const { instance, toast } = llenar();
      instance.ngOnInit();
      await flush(10);
      const cedula = { id: 'ced', type: 'TEXT', label: 'Cédula', order: 0, required: false, properties: { text_format: 'cedula_ec' } };
      instance.formulario = { ...form, questions: [cedula] };
      instance.preguntaActualIndex = 0;

      instance.respuestas['ced'] = '1710034066';
      expect(instance.puedeAvanzar).toBe(false);
      expect(instance.formValido()).toBe(false);
      instance.avanzarPregunta();
      expect(toast.show).toHaveBeenCalledWith('La cédula no es válida: revise el último dígito.', 'error');
      expect(instance.camposTocados.has('ced')).toBe(true);

      instance.respuestas['ced'] = '171003406-5';
      expect(instance.puedeAvanzar).toBe(true);
      expect(instance.formValido()).toBe(true);
    });

    it('acepta o rechaza el consentimiento', async () => {
      const { instance, router } = llenar();
      instance.ngOnInit();
      await flush(10);

      instance.aceptarConsentimiento();
      await flush();
      expect(instance.respuestas['_consentimiento_aceptado']).toBe(true);

      instance.draftId = 7;
      await instance.rechazarConsentimiento();
      expect(router.navigate).toHaveBeenCalledWith(['/lista']);
    });
  });
});
