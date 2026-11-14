export interface UpdateUserRequest {
  name?: string;
  email?: string;
  password?: string;
  rol?: 'SUPER_ADMIN' | 'ADMIN' | 'PROJECT' | 'RECOLECTOR';
  is_active?: boolean;
  telefono?: string;
  cargo?: string;
  bio?: string;
}
