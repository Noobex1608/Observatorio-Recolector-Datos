import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApiService } from '../api.service';
import { AuthService } from '../auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  it('shows incorrect credentials and stops loading after a 422 response', async () => {
    const api = {
      login: vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 422 })),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { guardarSesion: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    component.usuario = 'correo@ejemplo.com';
    component.clave = 'contraseña';

    await component.iniciarSesion();
    fixture.detectChanges();

    expect(api.login).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Correo o contraseña incorrectos.');
    expect(fixture.nativeElement.querySelector('button[type="submit"]')?.textContent).toContain('INICIAR SESIÓN');
    expect(fixture.nativeElement.querySelector('button[type="submit"]')?.disabled).toBe(false);
  });
});
