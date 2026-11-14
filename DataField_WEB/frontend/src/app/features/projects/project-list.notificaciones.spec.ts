import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { config, Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '@core/services/auth.service';
import { FormService } from '@core/services/form.service';
import { NotificationService } from '@core/services/notification.service';
import { ProjectService } from '@core/services/project.service';
import { ProjectListComponent } from './project-list.component';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Servicio falso: cualquier método devuelve el observable indicado. */
const fakeService = (result: () => Observable<unknown>) => new Proxy({}, { get: () => vi.fn(result) });

const OK_RESULT = {
  id: 'p1', data: [], pagination: { total: 0, current_page: 1, last_page: 1 }, added: 2, imported: 3, assigned: 4,
  users: [], pool_size: 0, capacity: 0, status: 'VALIDATED', rows: [], valid: true, credentials: [], zones: [],
};

function setup(result: () => Observable<unknown>, confirm = true) {
  const notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), confirm: vi.fn().mockResolvedValue(confirm) };
  TestBed.overrideComponent(ProjectListComponent, { set: { template: '', imports: [] } });
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: AuthService, useValue: { isAdmin: () => true, isSupervisor: () => false, user: () => ({ id: 1, rol: 'ADMIN' }), isSuperAdmin: () => true } },
      { provide: ProjectService, useValue: fakeService(result) },
      { provide: FormService, useValue: fakeService(result) },
      { provide: TranslateService, useValue: { instant: (key: string) => key, get: (key: string) => of(key), onLangChange: of() } },
      { provide: NotificationService, useValue: notify },
    ],
  });
  const component = TestBed.createComponent(ProjectListComponent).componentInstance as any;
  const project = { id: 'p1', name: 'Proyecto', leaders: [{ id: 1 }], forms: [{ id: 'f1', title: 'F', state: 'DRAFT' }] };
  component.selectedProject.set(project);
  component.selectedFormId?.set('f1');
  return { component, notify, project };
}

/** Ejecuta cada acción ignorando las que requieren más estado; solo interesa a qué notificación llegan. */
async function runAll(component: any, project: any) {
  const collector = { id: 9, name: 'Ana', email: 'ana@uleam.edu.ec', cedula: '1710034065', is_active: true };
  const form = { id: 'f1', title: 'F', start_date: '2026-11-01', end_date: '2026-11-10' };
  const zone = { id: 'z1', name: 'Centro' };
  const calls: Array<() => unknown> = [
    () => component.loadProjects(), () => component.loadCollectors('p1'), () => component.loadCollectorPage('p1'),
    () => component.selectAllCollectors(), () => component.loadCandidates(), () => component.addExistingCollectors(),
    () => component.downloadCollectorTemplate(), () => component.confirmCollectorImport(),
    () => component.chooseCollectorFile({ target: { files: [new File(['x'], 'e.xlsx')], value: '' } }),
    () => component.saveCollector(collector, 'Ana', 'ana@uleam.edu.ec', '1710034065'),
    () => component.setCollectorActive(collector, false), () => component.removeCollector(collector),
    () => component.assignCollectorForms(), () => component.selectProject(project),
    () => component.previewRandomAssignment(), () => component.confirmRandomAssignment(), () => component.publishSelectedForm(),
    () => component.saveProject(), () => component.saveTechnicalSheet(), () => component.validateTechnicalSheet(),
    () => component.saveFormPeriod(form), () => component.saveFormPeriod({ ...form, start_date: '2026-12-01', end_date: '2026-11-01' }),
    () => component.selectAllEnumerators(), () => component.toggleEnumeratorSelection(5),
    () => component.saveZone(), () => component.deleteZone(zone), () => component.submitNewForm(), () => component.deleteProject(project),
  ];
  for (const call of calls) {
    try { await call(); } catch { /* acción que necesita más estado */ }
    await flush();
  }
}

describe('Proyectos: avisos con el sistema de notificaciones', () => {
  // Algunas cargas secundarias no manejan errores (no son parte de esta prueba).
  beforeEach(() => { config.onUnhandledError = () => undefined; });
  afterEach(() => {
    config.onUnhandledError = null;
    TestBed.resetTestingModule();
  });

  it('los errores del servidor se muestran como notificaciones de error', async () => {
    const { component, notify, project } = setup(() => throwError(() => ({ error: { message: 'Falló el servidor' } })));
    component.randomPreview?.set({ users: [], pool_size: 0, capacity: 0 });
    component.randomCount?.set(1);
    component.technicalSheet?.set({ id: 's1', status: 'DRAFT' });
    await runAll(component, project);

    expect(notify.error.mock.calls.length).toBeGreaterThan(10);
    expect(notify.error).toHaveBeenCalledWith('Falló el servidor');
    expect(notify.confirm).toHaveBeenCalled();
  });

  it('las acciones exitosas avisan con éxito y las confirmaciones rechazadas no hacen nada', async () => {
    const { component, notify, project } = setup(() => of(OK_RESULT));
    component.randomPreview?.set({ users: [], pool_size: 0, capacity: 0 });
    component.randomCount?.set(1);
    await runAll(component, project);
    expect(notify.success.mock.calls.length).toBeGreaterThan(5);
    TestBed.resetTestingModule();

    const declined = setup(() => of(OK_RESULT), false);
    await declined.component.deleteZone({ id: 'z1', name: 'Centro' });
    await declined.component.deleteProject(declined.project);
    await declined.component.removeCollector({ id: 9, name: 'Ana' });
    expect(declined.notify.success).not.toHaveBeenCalled();
  });
});
