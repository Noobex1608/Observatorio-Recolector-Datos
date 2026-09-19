import { Routes } from '@angular/router';
import { UsersListPageComponent } from '../pages/users-list-page/users-list-page.component';
import { UserFormPageComponent } from '../pages/user-form-page/user-form-page.component';
import { roleGuard } from '../../../core/guards/role.guard';

export const USERS_ROUTES: Routes = [
  {
    path: '',
    component: UsersListPageComponent,
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
  },
  {
    path: 'new',
    component: UserFormPageComponent,
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
  },
  {
    path: ':id/edit',
    component: UserFormPageComponent,
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
  },
];
