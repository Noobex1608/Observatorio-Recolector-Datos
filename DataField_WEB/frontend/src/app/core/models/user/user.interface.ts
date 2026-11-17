import { Perfil } from './perfil.interface';
import { UserRole } from './user-role.type';

export interface User {
  id: number;
  name: string;
  email: string;
  rol: UserRole;
  is_active?: boolean;
  must_change_password?: boolean;
  /** Correo institucional ULEAM: entra con Microsoft 365. */
  is_institutional?: boolean;
  /** Usuario externo que aún no confirma su correo desde la invitación. */
  invitation_pending?: boolean;
  email_verified_at?: string;
  created_at?: string;
  updated_at?: string;
  perfil?: Perfil | null;
}
