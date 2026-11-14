import { Routes } from '@angular/router';
import { adminGuard, roleGuard } from '../core/guards/role.guard';
import { unsavedChangesGuard } from '../features/forms/builder/unsaved-changes.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('../features/forms/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    title: 'routes.dashboard',
  },
  {
    path: 'configuracion',
    loadComponent: () =>
      import('../features/profile/profile.component').then((m) => m.ProfileComponent),
    title: 'routes.accountSettings',
  },
  {
    path: 'forms/builder',
    loadComponent: () =>
      import('../features/forms/builder/builder.component').then((m) => m.BuilderComponent),
    canActivate: [roleGuard('SUPER_ADMIN', 'ADMIN', 'PROJECT')],
    canDeactivate: [unsavedChangesGuard],
    title: 'routes.newForm',
  },
  {
    path: 'forms/:id/edit',
    loadComponent: () =>
      import('../features/forms/builder/builder.component').then((m) => m.BuilderComponent),
    canDeactivate: [unsavedChangesGuard],
    title: 'routes.editForm',
  },
  {
    path: 'forms/:id/responses',
    loadComponent: () =>
      import('../features/forms/responses/responses.component').then((m) => m.ResponsesComponent),
    title: 'routes.formResponses',
  },
  {
    path: 'proyectos',
    loadComponent: () =>
      import('../features/projects/project-list.component').then((m) => m.ProjectListComponent),
    title: 'routes.projects',
  },
  {
    path: 'proyectos/:projectId/supervision/:userId',
    loadComponent: () =>
      import('../features/projects/supervision/collector-route.component').then((m) => m.CollectorRouteComponent),
    title: 'routes.projects',
  },
  // Usuarios (solo admin)
  {
    path: 'usuarios',
    loadComponent: () =>
      import('../features/usuarios/usuario-list/usuario-list.component').then(
        (m) => m.UsuarioListComponent,
      ),
    canActivate: [roleGuard('SUPER_ADMIN')],
    title: 'routes.users',
  },
  {
    path: 'usuarios/nuevo',
    loadComponent: () =>
      import('../features/usuarios/usuario-form/usuario-form.component').then(
        (m) => m.UsuarioFormComponent,
      ),
    canActivate: [roleGuard('SUPER_ADMIN')],
    title: 'routes.newUser',
  },
  {
    path: 'usuarios/:id',
    loadComponent: () =>
      import('../features/usuarios/usuario-form/usuario-form.component').then(
        (m) => m.UsuarioFormComponent,
      ),
    canActivate: [roleGuard('SUPER_ADMIN')],
    title: 'routes.editUser',
  },
  // Auditoria (solo SuperAdmin)
  {
    path: 'auditoria',
    loadComponent: () =>
      import('../features/audit-logs/audit-log.component').then(
        (m) => m.AuditLogComponent,
      ),
    canActivate: [roleGuard('SUPER_ADMIN')],
    title: 'routes.auditLogs',
  },
];

