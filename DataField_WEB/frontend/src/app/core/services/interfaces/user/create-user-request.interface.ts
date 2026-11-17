export interface CreateUserRequest {
  name: string;
  email: string;
  /** Solo para cuentas internas mientras Microsoft 365 no esté configurado. */
  password?: string;
  rol?: 'SUPER_ADMIN' | 'ADMIN' | 'PROJECT' | 'RECOLECTOR';
  is_active?: boolean;
  telefono?: string;
  cargo?: string;
  bio?: string;
}
