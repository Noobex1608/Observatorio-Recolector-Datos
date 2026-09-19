import { Perfil } from './perfil.interface';
import { UserRole } from './user-role.type';

export interface User {
  id: number;
  name: string;
  email: string;
  rol: UserRole;
  is_active?: boolean;
  email_verified_at?: string;
  created_at?: string;
  updated_at?: string;
  perfil?: Perfil | null;
}
