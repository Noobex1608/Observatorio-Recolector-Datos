import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthResponse } from '../models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

describe('AuthService session persistence', () => {
  const response: AuthResponse = {
    message: 'ok',
    token: 'test-token',
    user: { id: 1, name: 'Encuestador', email: 'test@uleam.edu.ec', rol: 'RECOLECTOR' },
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: { post: vi.fn().mockReturnValue(of(response)) } },
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps a non-remembered login in the current browser tab', () => {
    const auth = TestBed.inject(AuthService);
    auth.login({ email: 'test@uleam.edu.ec', password: 'secret' }).subscribe();

    expect(sessionStorage.getItem('auth_token')).toBe('test-token');
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('auth_user') ?? '{}').id).toBe(1);
  });

  it('persists a remembered login and removes an old tab-only session', () => {
    sessionStorage.setItem('auth_token', 'old-token');
    sessionStorage.setItem('auth_user', '{"id":99}');
    const auth = TestBed.inject(AuthService);
    auth.login({ email: 'test@uleam.edu.ec', password: 'secret' }, true).subscribe();

    expect(localStorage.getItem('auth_token')).toBe('test-token');
    expect(sessionStorage.getItem('auth_token')).toBeNull();
    expect(JSON.parse(localStorage.getItem('auth_user') ?? '{}').id).toBe(1);
  });
});

describe('AuthService: vuelve a la página que pidió iniciar sesión', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApiService, useValue: {} }] });
  });
  afterEach(() => sessionStorage.clear());

  it('recuerda una ruta interna una sola vez', () => {
    const auth = TestBed.inject(AuthService);
    auth.rememberReturnUrl('/prueba/f1');
    expect(auth.takeReturnUrl()).toBe('/prueba/f1');
    expect(auth.takeReturnUrl()).toBe('/admin/dashboard');
  });

  it('ignora destinos externos o de inicio de sesión', () => {
    const auth = TestBed.inject(AuthService);
    for (const url of ['//evil.example', 'https://evil.example', '/auth/login', '/\\evil.example']) {
      auth.rememberReturnUrl(url);
      expect(auth.takeReturnUrl()).toBe('/admin/dashboard');
    }
  });
});

