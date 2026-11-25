import { describe, expect, it } from 'vitest';
import { hoyLocal } from './fecha-local';

describe('hoyLocal', () => {
  it('usa la fecha del reloj local, no la de UTC', () => {
    // 29 de diciembre a las 23:30 hora local: en UTC−5 ya sería 30 en UTC.
    expect(hoyLocal(new Date(2026, 11, 29, 23, 30))).toBe('2026-12-29');
    expect(hoyLocal(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });
});
