import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { ApiService } from './api.service';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { DbService } from './db.service';
import { QuestionDateTimeComponent } from './questions/question-datetime/question-datetime.component';
import { QuestionGpsComponent } from './questions/question-gps/question-gps.component';
import { LocationService } from './services/location.service';
import { MediaStorageService } from './services/media-storage.service';
import { trimTrailingSlashes } from './utils/url';

describe('trimTrailingSlashes', () => {
  it('quita solo las barras finales', () => {
    expect(trimTrailingSlashes('https://api.uleam.test///')).toBe('https://api.uleam.test');
    expect(trimTrailingSlashes('https://api.uleam.test/v1')).toBe('https://api.uleam.test/v1');
    expect(trimTrailingSlashes('///')).toBe('');
  });
});

describe('ApiService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });
  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('arma la URL sin barras duplicadas y envía el token del mismo servidor', async () => {
    localStorage.setItem('kobo_token', 'abc');
    localStorage.setItem('kobo_server_url', 'https://api.uleam.test/');
    const api = TestBed.inject(ApiService);
    const http = TestBed.inject(HttpTestingController);

    const done = api.logout('https://api.uleam.test//');
    const req = http.expectOne('https://api.uleam.test/api/logout');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc');
    req.flush(null);
    await done;
  });

  it('rechaza usar el token con otro servidor', () => {
    localStorage.setItem('kobo_token', 'abc');
    localStorage.setItem('kobo_server_url', 'https://otro.uleam.test');
    const api = TestBed.inject(ApiService);
    expect(() => api.logout('https://api.uleam.test')).toThrow('La sesión pertenece a otro servidor. Vuelve a iniciar sesión.');
  });
});

describe('authGuard (app)', () => {
  it('manda al login sin sesión', () => {
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: { isAuthenticated: () => false } },
      ],
    });
    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    TestBed.resetTestingModule();
  });
});

describe('LocationService', () => {
  const geolocation = navigator.geolocation;
  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });
    TestBed.resetTestingModule();
  });

  it('consulta el permiso al pedir la posición, una sola vez', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({
      coords: { latitude: -0.95, longitude: -80.72, accuracy: 5, altitude: null },
      timestamp: Date.UTC(2026, 9, 29),
    } as unknown as GeolocationPosition));
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    const service = TestBed.inject(LocationService);
    const check = vi.spyOn(service, 'checkPermissionStatus');

    const first = await service.getCurrentPosition();
    await service.getCurrentPosition();

    expect(first.latitude).toBe(-0.95);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('si la consulta del permiso falla, lo deja en "prompt"', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 3, altitude: 4 }, timestamp: 0 } as unknown as GeolocationPosition) },
      configurable: true,
    });
    const service = TestBed.inject(LocationService);
    vi.spyOn(service, 'checkPermissionStatus').mockRejectedValue(new Error('sin permisos'));

    await service.getCurrentPosition();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(service.permissionStatus()).toBe('prompt');
  });
});

describe('MediaStorageService', () => {
  it('guarda el archivo con un identificador aleatorio seguro', async () => {
    const add = vi.fn(async () => 1);
    TestBed.configureTestingModule({ providers: [{ provide: DbService, useValue: { mediaBlobs: { add } } }] });
    const service = TestBed.inject(MediaStorageService);

    const first = await service.saveMediaBlob('q1', new Blob(['a']));
    const second = await service.saveMediaBlob('q1', new Blob(['b']));

    expect(first).toMatch(/^media_q1_\d+_[0-9a-z]+$/);
    expect(first).not.toBe(second);
    expect(add).toHaveBeenCalledTimes(2);
    TestBed.resetTestingModule();
  });
});

describe('Preguntas de fecha y GPS', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('normaliza fecha y hora válidas e ignora las inválidas', () => {
    TestBed.overrideComponent(QuestionDateTimeComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(QuestionDateTimeComponent);
    fixture.componentRef.setInput('question', { id: 'q', type: 'DATETIME', label: 'Fecha', order: 0 });
    fixture.componentRef.setInput('value', '2026-10-29T10:30:00.000Z');
    fixture.detectChanges();
    const emitted: (string | null)[] = [];
    fixture.componentInstance.valueChange.subscribe(value => emitted.push(value));

    fixture.componentInstance.onValueInput('2026-10-29T10:30');
    fixture.componentInstance.onValueInput('no es fecha');

    expect(fixture.componentInstance.rawValue()).toBe('no es fecha');
    expect(emitted[0]).toMatch(/^2026-10-29T/);
    expect(emitted[1]).toBe('no es fecha');
  });

  it('valida coordenadas manuales y la hora de la lectura', () => {
    TestBed.overrideComponent(QuestionGpsComponent, { set: { template: '', imports: [] } });
    TestBed.configureTestingModule({ providers: [{ provide: LocationService, useValue: { permissionStatus: () => 'granted' } }] });
    const fixture = TestBed.createComponent(QuestionGpsComponent);
    fixture.componentRef.setInput('question', { id: 'g', type: 'GPS', label: 'Ubicación', order: 0 });
    fixture.detectChanges();
    const gps = fixture.componentInstance as any;
    gps.currentLocation.set({ latitude: -0.95, longitude: -80.72, altitude: null, accuracy: 5, timestamp: 'fecha inválida' });

    expect(gps.formattedTime()).toBeNull();
    gps.manualLat.set(Number.NaN);
    gps.manualLng.set(-80.72);
    gps.saveManualLocation();
    expect(gps.errorMessage()).toBe('Por favor, ingrese coordenadas de latitud y longitud válidas.');
  });
});
