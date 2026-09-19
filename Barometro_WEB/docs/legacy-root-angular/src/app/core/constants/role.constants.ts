import { Role } from '../../features/users/models/user.model';

export const ROLES: Record<string, Role> = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  PROJECT_LEADER: 'PROJECT_LEADER',
  USER: 'USER',
};
