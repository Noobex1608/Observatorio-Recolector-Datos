import { describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { avatarUrl } from './avatar-url';

describe('URL de la foto de perfil', () => {
  it('usa la URL absoluta que guarda el backend', () => {
    expect(avatarUrl('https://api.uleam.test/api/avatars/a.webp')).toBe('https://api.uleam.test/api/avatars/a.webp');
  });

  it('completa rutas relativas de cuentas antiguas y vacíos', () => {
    const base = environment.apiUrl.replace(/\/api\/?$/, '');
    expect(avatarUrl('/api/avatars/a.png')).toBe(`${base}/api/avatars/a.png`);
    expect(avatarUrl('api/avatars/a.png')).toBe(`${base}/api/avatars/a.png`);
    expect(avatarUrl(null)).toBeNull();
    expect(avatarUrl('')).toBeNull();
  });
});
