import { UserRole } from '../models';

/** Todos los roles globales, del más al menos privilegiado. */
export const ALL_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'PROJECT', 'SUPERVISOR', 'RECOLECTOR'];

/** Roles que un usuario externo (correo no institucional) puede tener. */
export const EXTERNAL_ROLES: UserRole[] = ['SUPERVISOR', 'RECOLECTOR'];

/** Claves de traducción del nombre de cada rol (roles.*). */
export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'roles.SUPER_ADMIN',
  ADMIN: 'roles.ADMIN',
  PROJECT: 'roles.PROJECT',
  SUPERVISOR: 'roles.SUPERVISOR',
  RECOLECTOR: 'roles.RECOLECTOR',
};

/**
 * Roles que `actor` puede asignar, iguales a las reglas del backend:
 * - SUPER_ADMIN asigna cualquiera; ADMIN solo roles operativos (líder, supervisor, recolector).
 * - Un usuario externo solo puede ser supervisor o recolector.
 */
export function assignableRoles(actor: UserRole | null | undefined, institutional: boolean): UserRole[] {
  const byActor: UserRole[] = actor === 'SUPER_ADMIN'
    ? ALL_ROLES
    : actor === 'ADMIN' ? ['PROJECT', 'SUPERVISOR', 'RECOLECTOR'] : [];
  return institutional ? byActor : byActor.filter((role) => EXTERNAL_ROLES.includes(role));
}
