import { environment } from '../../../environments/environment';

/**
 * URL de la foto de perfil lista para usar en un <img>. El backend guarda una URL absoluta
 * (…/api/avatars/archivo.webp); las cuentas antiguas pueden tener una ruta relativa.
 */
export function avatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (/^https?:\/\//i.test(avatar)) return avatar;
  const base = environment.apiUrl.replace(/\/api\/?$/, '');
  return `${base}${avatar.startsWith('/') ? '' : '/'}${avatar}`;
}
