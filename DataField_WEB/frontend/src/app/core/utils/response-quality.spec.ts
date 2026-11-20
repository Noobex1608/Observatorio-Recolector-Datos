import { describe, expect, it } from 'vitest';
import { QualityResponse, QualityZone, reviewResponses } from './response-quality';

const square: QualityZone = {
  name: 'Campus',
  target_lat: null,
  target_lng: null,
  radius_meters: 0,
  geometry_json: {
    type: 'Polygon',
    coordinates: [[[-80.75, -0.96], [-80.74, -0.96], [-80.74, -0.95], [-80.75, -0.95], [-80.75, -0.96]]],
  },
};

function response(id: string, at: string, answers: Record<string, unknown>, user: number | null = 1): QualityResponse {
  return { id, submitted_at: at, rawAnswers: answers, user_id: user };
}

describe('reviewResponses', () => {
  it('marca un punto fuera del polígono de la zona', () => {
    const issues = reviewResponses(
      [
        response('dentro', '2026-11-17T10:00:00Z', { gps: { latitude: -0.955, longitude: -80.745 } }),
        response('fuera', '2026-11-17T11:00:00Z', { gps: { latitude: -0.9, longitude: -80.745 } }),
      ],
      ['gps'],
      [square],
    );
    expect(issues.map((issue) => [issue.responseId, issue.kind])).toEqual([['fuera', 'outside']]);
  });

  it('respeta lo que el teléfono registró sobre la zona', () => {
    const issues = reviewResponses(
      [response('r1', '2026-11-17T10:00:00Z', { gps: { latitude: -0.9, longitude: -80.745, geofence: { is_inside: true } } })],
      ['gps'],
      [square],
    );
    expect(issues).toEqual([]);
  });

  it('marca la baja precisión del GPS', () => {
    const issues = reviewResponses(
      [response('r1', '2026-11-17T10:00:00Z', { gps: { latitude: -0.955, longitude: -80.745, accuracy: 250 } })],
      ['gps'],
      [],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('accuracy');
    expect(issues[0].detail).toEqual({ key: 'forms.responses.page.quality.detail.accuracy', params: { accuracy: 250, limit: 100 } });
  });

  it('marca como posible duplicado dos envíos del mismo recolector en el mismo lugar', () => {
    const issues = reviewResponses(
      [
        response('a', '2026-11-17T10:00:00Z', { gps: { latitude: -0.955, longitude: -80.745 }, q: 'x' }),
        response('b', '2026-11-17T10:03:00Z', { gps: { latitude: -0.95501, longitude: -80.74501 }, q: 'y' }),
        response('c', '2026-11-17T10:04:00Z', { gps: { latitude: -0.955, longitude: -80.745 } }, 2),
      ],
      ['gps'],
      [],
    );
    expect(issues.map((issue) => [issue.responseId, issue.kind])).toEqual([['b', 'duplicate']]);
  });

  it('sin GPS, compara las respuestas', () => {
    const issues = reviewResponses(
      [
        response('a', '2026-11-17T10:00:00Z', { q: 'x' }),
        response('b', '2026-11-17T10:02:00Z', { q: 'x' }),
        response('c', '2026-11-17T10:30:00Z', { q: 'x' }),
      ],
      [],
      [],
    );
    expect(issues.map((issue) => issue.responseId)).toEqual(['b']);
  });
});
