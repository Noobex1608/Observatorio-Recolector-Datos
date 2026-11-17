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
      microsoftEnabled: vi.fn().mockResolvedValue({ microsoft: false, internal_domains: [] }),
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

  it('sends ULEAM accounts to Microsoft instead of the password login', async () => {
    const api = {
      login: vi.fn(),
      microsoftEnabled: vi.fn().mockResolvedValue({ microsoft: true, internal_domains: ['uleam.edu.ec', 'live.uleam.edu.ec'] }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { guardarSesion: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    await component.consultarProveedores();
    const microsoft = vi.spyOn(component, 'iniciarConMicrosoft').mockImplementation(() => undefined);

    component.usuario = 'estudiante@live.uleam.edu.ec';
    await component.iniciarSesion();
    expect(microsoft).toHaveBeenCalledOnce();
    expect(api.login).not.toHaveBeenCalled();

    component.usuario = 'externo@gmail.com';
    expect(component.esCorreoInstitucional()).toBe(false);
  });
});
