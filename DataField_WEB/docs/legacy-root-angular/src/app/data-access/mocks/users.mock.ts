import { User } from '../../features/users/models/user.model';

export const USERS_MOCK: User[] = [
  {
    id: 1,
    name: 'Administrador General',
    email: 'admin@universidad.edu',
    role: 'ADMIN',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Analista Institucional',
    email: 'analyst@universidad.edu',
    role: 'PROJECT_LEADER',
    isActive: true,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];
