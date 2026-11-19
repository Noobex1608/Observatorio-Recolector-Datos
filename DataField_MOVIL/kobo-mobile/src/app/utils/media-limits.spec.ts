import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { StoragePersistenceService } from '../services/storage-persistence.service';
import { MAX_RESPONSE_MEDIA_BYTES, mediaBudgetError } from './media-limits';

const MB = 1024 * 1024;

describe('Límite de archivos por encuesta (igual al servidor)', () => {
  it('acepta hasta 35 MB y 10 archivos', () => {
    expect(mediaBudgetError([])).toBeNull();
    expect(mediaBudgetError([20 * MB, 15 * MB])).toBeNull();
    expect(mediaBudgetError([MAX_RESPONSE_MEDIA_BYTES])).toBeNull();
  });

  it('rechaza dos videos de 20 MB y más de 10 archivos, con un mensaje claro', () => {
    expect(mediaBudgetError([20 * MB, 20 * MB])).toContain('suman 40 MB y el máximo por encuesta es 35 MB');
    expect(mediaBudgetError(Array(11).fill(MB))).toContain('tiene 11 archivos y el máximo es 10');
  });
});

describe('Almacenamiento persistente', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'storage', original);
    else delete (navigator as any).storage;
    TestBed.resetTestingModule();
  });

  function withStorage(storage: unknown): StoragePersistenceService {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });
    return TestBed.inject(StoragePersistenceService);
  }

  it('lo pide al navegador y recuerda si se concedió', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const service = withStorage({ persisted: vi.fn().mockResolvedValue(false), persist });
    expect(await service.request()).toBe('persistent');
    expect(persist).toHaveBeenCalled();
    expect(service.state()).toBe('persistent');
  });

  it('si el navegador lo niega o no lo soporta, no falla', async () => {
    expect(await withStorage({ persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(false) }).request()).toBe('best-effort');
    TestBed.resetTestingModule();
    expect(await withStorage({ persisted: vi.fn().mockRejectedValue(new Error('x')), persist: vi.fn() }).request()).toBe('best-effort');
    TestBed.resetTestingModule();
    expect(await withStorage(undefined).request()).toBe('unsupported');
  });
});
