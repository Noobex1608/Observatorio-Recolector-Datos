import { Role } from '../../users/models/user.model';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthSession {
  userId: number;
  name: string;
  email: string;
  role: Role;
  token: string;
}
