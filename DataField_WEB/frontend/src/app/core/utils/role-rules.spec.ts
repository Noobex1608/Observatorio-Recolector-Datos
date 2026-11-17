import { assignableRoles } from './role-rules';

describe('Reglas de roles', () => {
  it('el SUPER_ADMIN asigna todo; el ADMIN solo roles operativos', () => {
    expect(assignableRoles('SUPER_ADMIN', true)).toEqual(['SUPER_ADMIN', 'ADMIN', 'PROJECT', 'SUPERVISOR', 'RECOLECTOR']);
    expect(assignableRoles('ADMIN', true)).toEqual(['PROJECT', 'SUPERVISOR', 'RECOLECTOR']);
    expect(assignableRoles('PROJECT', true)).toEqual([]);
  });

  it('un usuario externo solo puede ser supervisor o recolector', () => {
    expect(assignableRoles('SUPER_ADMIN', false)).toEqual(['SUPERVISOR', 'RECOLECTOR']);
    expect(assignableRoles('ADMIN', false)).toEqual(['SUPERVISOR', 'RECOLECTOR']);
  });
});
