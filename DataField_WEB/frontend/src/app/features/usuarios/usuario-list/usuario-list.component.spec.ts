import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { UserService } from '@core/services/user.service';
import { UsuarioListComponent } from './usuario-list.component';

const requests = [
  { id: 1, name: 'Ana Zambrano', email: 'ana@uleam.edu.ec', status: 'PENDING', requested_at: null },
  { id: 2, name: 'José Mendoza', email: 'jose@live.uleam.edu.ec', status: 'PENDING', requested_at: null },
  { id: 3, name: 'María Cedeño', email: 'maria@dn.uleam.edu.ec', status: 'PENDING', requested_at: null },
];

function setup(role: 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN') {
  const users = {
    getUsers: vi.fn(() => of({ data: [], meta: { current_page: 1, total: 0, last_page: 1 } })),
    restoreUser: vi.fn(() => of({ message: 'ok', data: {} })),
    unlinkMicrosoft: vi.fn(() => of({ message: 'ok', data: {} })),
    getAccessRequests: vi.fn(() => of({ data: requests, pending_count: requests.length })),
    approveAccessRequests: vi.fn(() => of({ message: 'ok', approved: 2 })),
    rejectAccessRequests: vi.fn(() => of({ message: 'ok', rejected: 1 })),
  };
  const dialog = { open: vi.fn(() => ({ afterClosed: () => of(true) })) };
  TestBed.overrideComponent(UsuarioListComponent, { set: { template: '', imports: [] } });
  TestBed.configureTestingModule({
    providers: [
      { provide: UserService, useValue: users },
      { provide: MatDialog, useValue: dialog },
      { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: TranslateService, useValue: { instant: (key: string) => key } },
      { provide: AuthService, useValue: { userRole: () => role, isSuperAdmin: () => role === 'SUPER_ADMIN' } },
    ],
  });
  const component = TestBed.createComponent(UsuarioListComponent).componentInstance;
  component.ngOnInit();
  return { component, users, dialog };
}

describe('Solicitudes de acceso: tabla con selección y aprobación en lote', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('filtra por nombre o correo sin distinguir tildes y selecciona solo lo visible', () => {
    const { component } = setup();
    component.requestSearch.set('jose');
    expect(component.filteredRequests().map((request) => request.id)).toEqual([2]);

    component.toggleAllFiltered(true);
    expect([...component.selectedRequests()]).toEqual([2]);
    expect(component.allFilteredSelected()).toBe(true);

    component.requestSearch.set('');
    expect(component.someFilteredSelected()).toBe(true);
    component.toggleRequest(3, true);
    expect(component.selectedList().map((request) => request.id)).toEqual([2, 3]);
  });

  it('el rol por defecto es Recolector y se puede asignar a toda la selección', () => {
    const { component } = setup();
    expect(component.roleOf(1)).toBe('RECOLECTOR');

    component.toggleRequest(1, true);
    component.toggleRequest(3, true);
    component.setRoleForSelected('SUPERVISOR');
    component.setRequestRole(2, 'PROJECT');
    expect([component.roleOf(1), component.roleOf(2), component.roleOf(3)]).toEqual(['SUPERVISOR', 'PROJECT', 'SUPERVISOR']);
    // Un ADMIN no puede asignar ADMIN: vuelve al rol por defecto.
    component.setRequestRole(2, 'ADMIN');
    expect(component.roleOf(2)).toBe('RECOLECTOR');
  });

  it('aprueba las seleccionadas o todas las encontradas, cada una con su rol', () => {
    const { component, users } = setup();
    component.toggleRequest(1, true);
    component.setRequestRole(1, 'SUPERVISOR');
    component.approveSelected();
    expect(users.approveAccessRequests).toHaveBeenLastCalledWith([{ id: 1, rol: 'SUPERVISOR' }]);
    expect(component.selectedRequests().size).toBe(0);

    component.requestSearch.set('uleam');
    component.approveAllFiltered();
    expect(users.approveAccessRequests).toHaveBeenLastCalledWith([
      { id: 1, rol: 'SUPERVISOR' }, { id: 2, rol: 'RECOLECTOR' }, { id: 3, rol: 'RECOLECTOR' },
    ]);

    component.toggleRequest(2, true);
    component.rejectSelected();
    expect(users.rejectAccessRequests).toHaveBeenCalledWith([2]);
  });
});

describe('Usuarios eliminados', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lista los eliminados y restaura con confirmación', () => {
    const { component, users, dialog } = setup('SUPER_ADMIN');
    expect(component.displayedColumns()).toContain('actions');

    component.setUserView('deleted');
    expect(users.getUsers).toHaveBeenLastCalledWith(15, 1, true);
    expect(component.displayedColumns()).toEqual(['name', 'email', 'rol', 'deleted_at', 'restore']);

    component.restoreUser({ id: 9, name: 'Docente', email: 'docente@uleam.edu.ec', rol: 'PROJECT' } as never);
    expect(dialog.open).toHaveBeenCalled();
    expect(users.restoreUser).toHaveBeenCalledWith(9);
    expect(users.getUsers).toHaveBeenLastCalledWith(15, 1, true);

    component.setUserView('active');
    expect(users.getUsers).toHaveBeenLastCalledWith(15, 1, false);
  });
});

describe('Vinculación con Microsoft', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('restablece la vinculación con confirmación y la refleja en la lista', () => {
    const { component, users, dialog } = setup();
    const docente = { id: 4, name: 'Docente', email: 'docente@uleam.edu.ec', rol: 'PROJECT', microsoft_linked: true } as never;
    component.users.set([docente]);

    component.unlinkMicrosoft(docente);

    expect(dialog.open).toHaveBeenCalled();
    expect(users.unlinkMicrosoft).toHaveBeenCalledWith(4);
    expect(component.users()[0].microsoft_linked).toBe(false);
  });
});
