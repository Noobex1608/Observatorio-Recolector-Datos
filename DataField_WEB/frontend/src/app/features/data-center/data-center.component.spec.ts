import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { DataCenterService } from '@core/services/data-center.service';
import { FormService } from '@core/services/form.service';
import { NotificationService } from '@core/services/notification.service';
import { DataCenterComponent } from './data-center.component';
import { provideSpanishTranslations } from '../../testing/spanish-translations';

// Traducciones reales en español: las pruebas comprueban el texto que ve el usuario.
beforeEach(() => TestBed.configureTestingModule({ providers: provideSpanishTranslations() }));

const items = [
  { id: 'f1', name: 'Hogares 2026', context: 'Proyecto «Manabí»', deleted_at: '2026-11-18T10:00:00Z', deleted_by: 'Ana', can_purge: true },
  { id: 'f2', name: 'Prueba', context: 'Proyecto «Guayas»', deleted_at: null, deleted_by: null, can_purge: true },
];

function setup(overrides: Record<string, unknown> = {}) {
  const service = {
    trash: vi.fn(() => of({ data: items })),
    restore: vi.fn(() => of({ message: 'Restaurado.' })),
    purge: vi.fn(() => of({ message: 'Eliminado.' })),
    ...overrides,
  };
  const forms = { exportResponses: vi.fn(() => of(new Blob(['x']))) };
  const notify = { success: vi.fn(), error: vi.fn() };
  TestBed.overrideComponent(DataCenterComponent, { set: { template: '', imports: [] } });
  TestBed.configureTestingModule({
    providers: [
      { provide: DataCenterService, useValue: service },
      { provide: FormService, useValue: forms },
      { provide: NotificationService, useValue: notify },
      { provide: MatDialog, useValue: { open: vi.fn(() => ({ afterClosed: () => of(true) })) } },
    ],
  });
  const component = TestBed.createComponent(DataCenterComponent).componentInstance;
  component.ngOnInit();
  return { component, service, notify };
}

describe('Centro de datos: papelera', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('carga por tipo, filtra y restaura o elimina definitivamente', () => {
    const { component, service, notify } = setup();
    expect(service.trash).toHaveBeenCalledWith('forms');

    component.search.set('guayas');
    expect(component.filtered().map((item) => item.id)).toEqual(['f2']);

    component.restore(items[0]);
    expect(service.restore).toHaveBeenCalledWith('forms', 'f1');
    expect(component.items().map((item) => item.id)).toEqual(['f2']);

    // Un formulario no se borra con un clic: pide su nombre exacto.
    component.purge(items[1]);
    expect(service.purge).not.toHaveBeenCalled();
    expect(component.purging()?.id).toBe('f2');
    component.purgeConfirm.set('prueba');
    component.confirmPurgeForm(items[1]);
    expect(service.purge).not.toHaveBeenCalled();
    component.purgeConfirm.set(' Prueba ');
    component.confirmPurgeForm(items[1]);
    expect(service.purge).toHaveBeenCalledWith('forms', 'f2', 'Prueba');
    expect(component.purging()).toBeNull();
    expect(notify.success).toHaveBeenCalledTimes(2);

    component.select('responses');
    expect(service.trash).toHaveBeenLastCalledWith('responses');
    expect(component.search()).toBe('');
  });

  it('muestra el motivo del servidor cuando no se puede restaurar', () => {
    const { component, notify } = setup({
      restore: vi.fn(() => throwError(() => ({ error: { message: 'Su proyecto está en la papelera: restaura primero el proyecto.' } }))),
    });
    component.restore(items[0]);
    expect(notify.error).toHaveBeenCalledWith('Su proyecto está en la papelera: restaura primero el proyecto.');
    expect(component.items()).toHaveLength(2);
  });
});
