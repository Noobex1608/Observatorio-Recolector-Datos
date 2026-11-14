import { Observable } from 'rxjs';
import { AuthSession, LoginCredentials } from '../../features/auth/models/auth.model';

export interface AuthRepository {
  login(credentials: LoginCredentials): Observable<AuthSession>;
  logout(): Observable<void>;
}
