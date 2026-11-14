import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AjustesComponent } from './ajustes/ajustes.component';
import { ApiService } from './api.service';
import { AppComponent } from './app';
import { AuthService } from './auth.service';
import { BorradoresComponent } from './borradores/borradores.component';
import { DbService } from './db.service';
import { StorageService } from './storage.service';
import { ThemeService } from './theme.service';
import { ToastService } from './toast.service';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Diálogo propio de la app', () => {
  afterEach(() => TestBed.resetTestingModule());

  function app() {
    TestBed.overrideComponent(AppComponent, { set: { template: '', imports: [] } });
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { url: '/' } }, { provide: ThemeService, useValue: { t: (k: string) => k } }],
    });
    const fixture = TestBed.createComponent(AppComponent);
    return { fixture, component: fixture.componentInstance, toast: TestBed.inject(ToastService) };
  }

  it('responde confirmaciones y datos pedidos, y devuelve el foco', async () => {
    const { fixture, component, toast } = app();
    const origin = document.createElement('button');
    document.body.appendChild(origin);
    origin.focus();

    const answer = toast.prompt({ title: 'Servidor', label: 'Dirección', value: 'https://a.test' });
    fixture.detectChanges();
    await flush();
    expect(component.dialogValue).toBe('https://a.test');
    component.dialogValue = 'https://b.test';
    component.answerDialog(true);
    await expect(answer).resolves.toBe('https://b.test');
    fixture.detectChanges();
    await flush();
    expect(document.activeElement).toBe(origin);

    const cancelled = toast.prompt({ title: 'Servidor', label: 'Dirección' });
    component.answerDialog(false);
    await expect(cancelled).resolves.toBeNull();

    const confirmed = toast.confirm({ title: 'Eliminar', tone: 'danger' });
    component.answerDialog(true);
    await expect(confirmed).resolves.toBe(true);
    component.answerDialog(true);
    expect(component.isHomeRoute).toBe(true);
    expect(component.isLoginRoute).toBe(false);
  });

  it('Escape cancela y Tab no sale del diálogo', async () => {
    const { component, toast } = app();
    const box = document.createElement('div');
    const first = document.createElement('button');
    const last = document.createElement('button');
    box.append(first, last);
    document.body.appendChild(box);
    const key = (k: string, shift = false) => {
      const event = { key: k, shiftKey: shift, currentTarget: box, preventDefault: vi.fn() } as unknown as KeyboardEvent;
      component.onDialogKeydown(event);
      return event;
    };

    const pending = toast.confirm({ title: 'Salir' });
    last.focus();
    expect(key('Tab').preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(first);
    expect(key('Tab', true).preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(last);
    expect(key('a').preventDefault).not.toHaveBeenCalled();
    key('Escape');
    await expect(pending).resolves.toBe(false);
    const empty = { key: 'Tab', shiftKey: false, currentTarget: document.createElement('div'), preventDefault: vi.fn() } as unknown as KeyboardEvent;
    component.onDialogKeydown(empty);
    expect(empty.preventDefault).not.toHaveBeenCalled();
  });
});

describe('Ajustes y borradores usan el diálogo propio', () => {
  afterEach(() => TestBed.resetTestingModule());

  function ajustes(dialog: { prompt?: string | null; confirm?: boolean }, unsent = 0) {
    const toast = {
      show: vi.fn(),
      prompt: vi.fn(async () => dialog.prompt ?? null),
      confirm: vi.fn(async () => dialog.confirm ?? false),
    };
    const auth = { obtenerUrlServidor: () => 'https://viejo.uleam.test', obtenerToken: () => 't', esModoDemo: () => false, logout: vi.fn() };
    const table = { clear: vi.fn(async () => undefined) };
    const db = {
      forms: table, formList: table, responses: { ...table, where: () => ({ anyOf: () => ({ count: async () => unsent }) }) }, mediaBlobs: table,
      transaction: vi.fn(async (...args: unknown[]) => (args[args.length - 1] as () => Promise<void>)()),
    };
    const router = { navigate: vi.fn(async () => true) };
    const storage = { limpiarFormularios: vi.fn(async () => undefined) };
    TestBed.overrideComponent(AjustesComponent, { set: { template: '', imports: [] } });
    TestBed.configureTestingModule({
      providers: [
        { provide: ToastService, useValue: toast }, { provide: AuthService, useValue: auth },
        { provide: ApiService, useValue: { logout: vi.fn(async () => undefined) } }, { provide: DbService, useValue: db },
        { provide: Router, useValue: router }, { provide: StorageService, useValue: storage },
        { provide: Location, useValue: { back: vi.fn() } }, { provide: ThemeService, useValue: { t: (k: string) => k } },
      ],
    });
    return { component: TestBed.createComponent(AjustesComponent).componentInstance, toast, auth, router, storage };
  }

  it('cambia de servidor solo con una dirección válida y tras confirmar', async () => {
    let ctx = ajustes({ prompt: null });
    await ctx.component.cambiarServidor();
    expect(ctx.toast.confirm).not.toHaveBeenCalled();
    TestBed.resetTestingModule();

    ctx = ajustes({ prompt: 'https://nuevo.uleam.test/api?x=1' });
    await ctx.component.cambiarServidor();
    expect(ctx.toast.show).toHaveBeenCalledWith('Ingrese el origen HTTPS del backend, sin ruta ni parámetros.', 'error');
    TestBed.resetTestingModule();

    ctx = ajustes({ prompt: 'https://nuevo.uleam.test' }, 2);
    await ctx.component.cambiarServidor();
    expect(ctx.toast.show).toHaveBeenCalledWith('Hay 2 respuestas pendientes. Sincronícelas antes de cambiar el servidor.', 'warning');
    TestBed.resetTestingModule();

    ctx = ajustes({ prompt: 'https://nuevo.uleam.test', confirm: false });
    await ctx.component.cambiarServidor();
    expect(ctx.auth.logout).not.toHaveBeenCalled();
    TestBed.resetTestingModule();

    ctx = ajustes({ prompt: 'https://nuevo.uleam.test', confirm: true });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    await ctx.component.cambiarServidor();
    expect(ctx.auth.logout).toHaveBeenCalled();
    expect(localStorage.getItem('kobo_server_url')).toBe('https://nuevo.uleam.test');
    expect(ctx.router.navigate).toHaveBeenCalledWith(['/login']);
    localStorage.clear();
  });

  it('borra los datos locales solo si se confirma', async () => {
    let ctx = ajustes({ confirm: false });
    await ctx.component.limpiarDatos();
    expect(ctx.storage.limpiarFormularios).not.toHaveBeenCalled();
    TestBed.resetTestingModule();

    ctx = ajustes({ confirm: true });
    await ctx.component.limpiarDatos();
    expect(ctx.storage.limpiarFormularios).toHaveBeenCalled();
    ctx.component.verAcercaDe();
    ctx.component.regresarAtras();
  });

  it('elimina un borrador tras confirmar', async () => {
    const confirm = vi.fn(async () => true);
    const remove = vi.fn(async () => undefined);
    const query = { equals: () => query, delete: vi.fn(async () => undefined), toArray: async () => [] };
    TestBed.overrideComponent(BorradoresComponent, { set: { template: '', imports: [] } });
    TestBed.configureTestingModule({
      providers: [
        { provide: ToastService, useValue: { confirm } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ThemeService, useValue: { t: (k: string) => k } },
        { provide: DbService, useValue: {
          responses: { delete: remove, where: () => query }, mediaBlobs: { where: () => query },
          transaction: async (...args: unknown[]) => (args[args.length - 1] as () => Promise<void>)(),
        } },
      ],
    });
    const component = TestBed.createComponent(BorradoresComponent).componentInstance;
    await component.eliminar(undefined);
    await component.eliminar(4);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger' }));
    expect(remove).toHaveBeenCalledWith(4);
    confirm.mockResolvedValueOnce(false);
    await component.eliminar(5);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
