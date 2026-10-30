import { HttpClient, HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom, isObservable, Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { adminGuard, roleGuard } from './core/guards/role.guard';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { ApiService } from './core/services/api.service';
import { AuthService } from './core/services/auth.service';
import { FormService } from './core/services/form.service';
import { formatManzanaName, formatSectorName, GisService } from './core/services/gis.service';
import { ThemeService } from './core/services/theme.service';
import { UserService } from './core/services/user.service';
import { qrMatrix } from './core/utils/qr-code';
import { ChangePasswordComponent } from './features/auth/change-password.component';
import { LoginComponent } from './features/auth/login/login.component';
import { GpsResultsMapComponent } from './features/forms/responses/gps-results-map.component';
import { RouteMapComponent } from './features/projects/supervision/route-map.component';
import { UsuarioFormComponent } from './features/usuarios/usuario-form/usuario-form.component';
import { FormatNumberPipe } from './presentation/shared/pipes/format-number.pipe';
import { FormDashboardViewModel } from './presentation/viewmodels/form-dashboard.viewmodel';
import { AnswerViewerComponent } from './shared/components/answer-viewer/answer-viewer.component';
import { MainLayoutComponent } from './shared/components/layout/main-layout.component';
import { MapGeofenceSelectorComponent } from './shared/components/map-geofence-selector/map-geofence-selector.component';
import { environment } from '../environments/environment';

const router = () => ({ navigate: vi.fn().mockResolvedValue(true), createUrlTree: vi.fn((commands: string[]) => commands.join('/')) });
const translate = { instant: (key: string) => key, get: (key: string) => of(key), onLangChange: of(), stream: (key: string) => of(key) };

/** Crea una clase que usa inject() sin renderizar su plantilla. */
function build<T>(factory: () => T, providers: unknown[]): T {
  TestBed.configureTestingModule({ providers: providers as any[] });
  return TestBed.runInInjectionContext(factory);
}

afterEach(() => TestBed.resetTestingModule());

describe('Guards e interceptor: redirecciones', () => {
  it('authGuard manda al login sin token, con token inválido o si falla la validación', async () => {
    const nav = router();
    const auth = { isAuthenticated: vi.fn(() => true), user: vi.fn(() => null), checkAuth: vi.fn(() => of(false)) };
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: nav }, { provide: AuthService, useValue: auth }] });
    const run = () => TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));

    auth.isAuthenticated.mockReturnValueOnce(false);
    expect(run()).toBe(false);

    const invalid = run();
    expect(isObservable(invalid)).toBe(true);
    expect(await firstValueFrom(invalid as Observable<unknown>)).toBe(false);

    auth.checkAuth.mockReturnValueOnce(throwError(() => new Error('red')));
    expect(await firstValueFrom(run() as Observable<unknown>)).toBe(false);
    expect(nav.navigate).toHaveBeenCalledTimes(3);
    expect(nav.navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  it('guestGuard envía al panel o a cambiar la contraseña temporal', () => {
    const nav = router();
    const auth = { isAuthenticated: () => true, user: vi.fn(() => ({ must_change_password: true })) };
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: nav }, { provide: AuthService, useValue: auth }] });

    expect(TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any))).toBe(false);
    auth.user.mockReturnValue({ must_change_password: false });
    TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any));

    expect(nav.navigate).toHaveBeenCalledWith(['/auth/change-password']);
    expect(nav.navigate).toHaveBeenCalledWith(['/admin/dashboard']);
  });

  it('adminGuard y roleGuard redirigen según el rol', () => {
    const nav = router();
    const auth = { isAdmin: () => false, hasAnyRole: () => false, userRole: vi.fn(() => null as string | null) };
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: nav }, { provide: AuthService, useValue: auth }] });

    expect(TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any))).toBe(false);
    const guard = roleGuard('ADMIN' as any);
    expect(TestBed.runInInjectionContext(() => guard({} as any, {} as any))).toBe(false);
    auth.userRole.mockReturnValue('RECOLECTOR');
    TestBed.runInInjectionContext(() => guard({} as any, {} as any));

    expect(nav.navigate).toHaveBeenCalledWith(['/auth/login']);
    expect(nav.navigate.mock.calls.filter(([route]) => route[0] === '/admin/dashboard')).toHaveLength(2);
  });

  it('el interceptor limpia la sesión y vuelve al login ante un 401', async () => {
    const nav = router();
    const auth = { getToken: () => 'abc', clearAuthSilent: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: nav }, { provide: AuthService, useValue: auth }] });
    const request = new HttpRequest('GET', `${environment.apiUrl}/forms`);

    const result = TestBed.runInInjectionContext(() =>
      authInterceptor(request, (req) => {
        expect(req.headers.get('Authorization')).toBe('Bearer abc');
        return throwError(() => new HttpErrorResponse({ status: 401 }));
      }));

    await expect(firstValueFrom(result)).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(auth.clearAuthSilent).toHaveBeenCalled();
    expect(nav.navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  it('AuthService.logout vuelve al login aunque falle la llamada al servidor', () => {
    const nav = router();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: nav },
        { provide: ApiService, useValue: { post: () => throwError(() => new Error('sin red')) } },
      ],
    });
    const auth = TestBed.inject(AuthService);
    auth.logout().subscribe();
    expect(nav.navigate).toHaveBeenCalledWith(['/auth/login']);
  });
});

describe('Login y cambio de contraseña', () => {
  it('el login lleva al panel o a cambiar la contraseña temporal', () => {
    const nav = router();
    const auth = { login: vi.fn(() => of({ user: { must_change_password: false } })) };
    const login = build(() => new LoginComponent(), [
      { provide: Router, useValue: nav }, { provide: AuthService, useValue: auth }, { provide: TranslateService, useValue: translate },
    ]);
    login.form.setValue({ email: 'ana@uleam.edu.ec', password: 'secreta123', rememberMe: false });

    login.onSubmit();

    expect(auth.login).toHaveBeenCalledWith({ email: 'ana@uleam.edu.ec', password: 'secreta123' }, false);
    expect(nav.navigate).toHaveBeenCalledWith(['/admin/dashboard']);
  });

  it('cambiar contraseña sin sesión vuelve al login', () => {
    const nav = router();
    const page = build(() => new ChangePasswordComponent(), [
      { provide: Router, useValue: nav }, { provide: AuthService, useValue: { isAuthenticated: () => false } },
    ]);
    page.submit();
    expect(nav.navigate).toHaveBeenCalledWith(['/auth/login']);
  });
});

describe('Formulario de usuario', () => {
  function form(params: Record<string, string>, userService: Record<string, unknown>) {
    const nav = router();
    const snackBar = { open: vi.fn() };
    const component = build(() => new UsuarioFormComponent(), [
      { provide: Router, useValue: nav },
      { provide: ActivatedRoute, useValue: { snapshot: { params } } },
      { provide: UserService, useValue: userService },
      { provide: MatSnackBar, useValue: snackBar },
      { provide: TranslateService, useValue: translate },
    ]);
    component.ngOnInit();
    return { component, nav, snackBar };
  }
  const valid = { name: 'Ana', email: 'ana@uleam.edu.ec', password: 'secreta123', rol: 'RECOLECTOR', is_active: true, telefono: '', cargo: '', bio: '' };

  it('crea el usuario y vuelve a la lista', () => {
    const createUser = vi.fn(() => of({}));
    const { component, nav, snackBar } = form({}, { createUser });
    component.userForm.setValue(valid);
    component.onSubmit();
    expect(createUser).toHaveBeenCalled();
    expect(snackBar.open).toHaveBeenCalledWith('users.messages.created', 'common.buttons.close', { duration: 3000 });
    expect(nav.navigate).toHaveBeenCalledWith(['/admin/usuarios']);
  });

  it('muestra el error del servidor al crear', () => {
    const { component, snackBar } = form({}, { createUser: () => throwError(() => ({ error: { message: 'Correo duplicado' } })) });
    component.userForm.setValue(valid);
    component.onSubmit();
    expect(snackBar.open).toHaveBeenCalledWith('Correo duplicado', 'common.buttons.close', { duration: 3000 });
    expect(component.loading()).toBe(false);
  });

  it('edita un usuario existente y avisa si no se pudo cargar', () => {
    const updateUser = vi.fn(() => throwError(() => ({})));
    const { component, nav, snackBar } = form({ id: '7' }, {
      getUserById: () => throwError(() => new Error('404')),
      updateUser,
    });
    expect(component.userId()).toBe(7);
    expect(nav.navigate).toHaveBeenCalledWith(['/admin/usuarios']);

    component.userForm.setValue(valid);
    component.onSubmit();
    expect(updateUser).toHaveBeenCalledWith(7, expect.objectContaining({ name: 'Ana' }));
    expect(snackBar.open).toHaveBeenCalledWith('users.messages.updateError', 'common.buttons.close', { duration: 3000 });
  });
});

describe('Utilidades', () => {
  it('formatNumber trata como vacío lo que no es número', () => {
    const pipe = new FormatNumberPipe();
    expect(pipe.transform(Number.NaN)).toBe('-');
    expect(pipe.transform('abc' as unknown as number)).toBe('-');
    expect(pipe.transform(null)).toBe('-');
  });

  it('nombres INEC de sector y manzana', () => {
    expect(formatSectorName('130850001002', undefined, 'MANTA')).toBe('Sector 2 (Zona 1, MANTA)');
    expect(formatManzanaName('130850001002003')).toBe('Manzana 3 - Sector 2 (Zona 1)');
  });

  it('zonas censales de una parroquia', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: {} }] });
    const gis = TestBed.inject(GisService);
    vi.spyOn(gis, 'getSectoresByParroquia').mockReturnValue(of({
      type: 'FeatureCollection',
      features: [
        { properties: { cod_sector: '130850002001' } },
        { properties: { cod_sector: '130850999001' } },
        { properties: { sec: '130850002005' } },
      ],
    } as any));

    const zonas = await firstValueFrom(gis.getZonasByParroquia('130850'));
    expect(zonas).toEqual([{ code: '130850002', name: 'Zona 2' }, { code: '130850999', name: 'Zona 999 (Sector Rural)' }]);
  });

  it('el código QR es cuadrado y conserva los patrones de posición', () => {
    const matrix = qrMatrix('https://barometro.uleam.edu.ec/collect/abc');
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
    expect(matrix[0].slice(0, 7).every(Boolean)).toBe(true);
  });
});

describe('Componentes con mapa y portapapeles', () => {
  it('el visor de respuestas interpreta coordenadas, calificaciones y copia texto', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const viewer = build(() => new AnswerViewerComponent(), [{ provide: FormService, useValue: {} }]);

    viewer.question = { id: 'q', type: 'GPS', label: 'Ubicación', properties: { target_lat: '-0.95', target_lng: '-80.72', radius_meters: 500 } } as any;
    viewer.value = { latitude: '-0.95', longitude: '-80.72', accuracy: '4.6' };
    expect(viewer.gpsCoords).toEqual({ lat: -0.95, lng: -80.72, accuracy: 5 });
    expect(viewer.geofenceResult?.isInside).toBe(true);

    viewer.value = ['-0.9', '-80.7'];
    expect(viewer.gpsCoords).toEqual({ lat: -0.9, lng: -80.7 });
    viewer.value = null;
    viewer.formattedValue = '-0.5, -80.1';
    expect(viewer.gpsCoords).toEqual({ lat: -0.5, lng: -80.1 });
    viewer.formattedValue = 'no es fecha';
    expect(viewer.parsedDate).toBeNull();

    viewer.value = '4.6';
    expect(viewer.ratingValue).toBe(5);
    viewer.value = 'x';
    expect(viewer.ratingValue).toBeNull();

    viewer.transcriptionText = 'hola';
    viewer.copyTranscription();
    viewer.copyToClipboard('texto');
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('hola');
    expect(writeText).toHaveBeenCalledWith('texto');
  });

  it('el menú lateral en móvil se abre y se cierra con el sidenav', () => {
    const layout = build(() => new MainLayoutComponent(), [{ provide: ThemeService, useValue: {} }]);
    const sidenav = { toggle: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    layout.sidenav = sidenav as any;
    layout.isMobile.set(true);

    layout.toggleSidenav();
    layout.onNavigate();

    expect(sidenav.toggle).toHaveBeenCalled();
    expect(sidenav.close).toHaveBeenCalled();
  });

  it('el selector de zona detecta parroquias rurales e ignora resultados sin coordenadas', () => {
    const selector = build(() => new MapGeofenceSelectorComponent(), [
      { provide: PLATFORM_ID, useValue: 'server' },
      { provide: HttpClient, useValue: {} },
      { provide: GisService, useValue: {} },
    ]);
    selector.ngAfterViewInit();

    (selector as any).selectedParroquia.set('130851');
    expect(selector.isRuralZone()).toBe(true);
    (selector as any).selectedParroquia.set('130850');
    expect(selector.isRuralZone()).toBe(false);

    selector.selectSearchResult({ lat: 'x', lon: 'y', display_name: 'Manta, Ecuador' } as any);
    expect(selector.searchQuery()).toBe('');
  });

  it('el mapa de respuestas no se monta fuera del navegador', () => {
    const map = new GpsResultsMapComponent('server' as unknown as object);
    expect(() => map.ngAfterViewInit()).not.toThrow();
  });

  it('el mapa del recorrido dibuja inicio, reanudación y fin y avisa la encuesta elegida', () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    const fixture = TestBed.createComponent(RouteMapComponent);
    const survey = {
      id: 's1', started_at: '2026-10-29T14:00:00Z', alerts: [{ code: 'salio_de_zona', message: '' }],
      path: [
        [-0.95, -80.72, 5, '2026-10-29T14:00:00Z', true, true, 'inicio'],
        [-0.96, -80.72, 5, '2026-10-29T14:05:00Z', false, true, 'reanudar'],
        [-0.95, -80.721, 5, '2026-10-29T14:10:00Z', false, true, 'fin'],
      ],
    };
    fixture.componentRef.setInput('surveys', [survey, { ...survey, id: 's2' }]);
    fixture.componentRef.setInput('zones', [{ id: 'z', name: 'Centro', geometry_json: null, target_lat: -0.95, target_lng: -80.72, radius_meters: 500 }]);
    fixture.detectChanges();
    const emitted: string[] = [];
    fixture.componentInstance.surveySelect.subscribe((id) => emitted.push(id));

    // Leaflet simulado: cada capa ejecuta su clic al registrarlo.
    const bounds = { extend: () => bounds, isValid: () => true, pad: () => bounds };
    const layer = () => {
      const item: any = { bindTooltip: () => item, addTo: () => item, getBounds: () => bounds, on: (_: string, cb: () => void) => { cb(); return item; } };
      return item;
    };
    const component = fixture.componentInstance as any;
    component.L = { polyline: layer, circleMarker: layer, marker: layer, circle: layer, geoJSON: layer, divIcon: () => ({}), latLngBounds: () => bounds };
    component.map = { fitBounds: vi.fn(), remove: vi.fn() };
    component.layer = { clearLayers: vi.fn() };
    component.render();

    expect(emitted.length).toBeGreaterThanOrEqual(6);
    expect(new Set(emitted)).toEqual(new Set(['s1', 's2']));
    expect(component.map.fitBounds).toHaveBeenCalled();
  });

  it('abrir el panel de compartir carga los accesos del formulario', async () => {
    const getShares = vi.fn(() => of([{ id: 1 }]));
    TestBed.configureTestingModule({
      providers: [
        FormDashboardViewModel,
        { provide: FormService, useValue: { getShares } },
        { provide: AuthService, useValue: {} },
        { provide: UserService, useValue: {} },
        { provide: TranslateService, useValue: translate },
      ],
    });
    const vm = TestBed.inject(FormDashboardViewModel);
    vm.openShareModal('f1');
    await Promise.resolve();
    expect(getShares).toHaveBeenCalledWith('f1');
    expect(vm.shareModalOpen()).toBe(true);
  });
});

