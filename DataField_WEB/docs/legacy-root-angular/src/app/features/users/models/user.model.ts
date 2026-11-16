export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'PROJECT_LEADER' | 'USER';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}
