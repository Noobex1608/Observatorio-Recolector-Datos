/**
 * Revisión de calidad de las respuestas cargadas en la pantalla de resultados.
 * Señala lo que conviene revisar a mano; no decide ni anula nada.
 */

export type QualityIssueKind = 'outside' | 'accuracy' | 'duplicate';

export interface QualityIssue {
  responseId: string;
  kind: QualityIssueKind;
  /** Explicación del problema: clave de traducción y sus valores. */
  detail: QualityDetail;
  submittedAt: string;
  userId: number | string | null;
}

export interface QualityDetail {
  key: string;
  params?: Record<string, string | number>;
}

const K = 'forms.responses.page.quality.detail.';

export interface QualityResponse {
  id: string;
  submitted_at: string;
  rawAnswers: Record<string, any>;
  user_id?: number | string | null;
}

export interface QualityZone {
  name: string;
  target_lat: number | null;
  target_lng: number | null;
  radius_meters: number;
  geometry_json: unknown;
}

export interface QualityOptions {
  /** Precisión del GPS por encima de la cual se marca (metros). */
  maxAccuracyMeters?: number;
  /** Ventana para considerar dos envíos del mismo recolector como posible duplicado (minutos). */
  duplicateWindowMinutes?: number;
  /** Distancia máxima entre dos puntos para tratarlos como el mismo lugar (metros). */
  duplicateDistanceMeters?: number;
}

const DEFAULTS: Required<QualityOptions> = {
  maxAccuracyMeters: 100,
  duplicateWindowMinutes: 10,
  duplicateDistanceMeters: 25,
};

interface Coords { lat: number; lng: number; accuracy: number | null; raw: any }

export function reviewResponses(
  responses: QualityResponse[],
  gpsQuestionIds: string[],
  zones: QualityZone[],
  options: QualityOptions = {},
): QualityIssue[] {
  const opts = { ...DEFAULTS, ...options };
  const usableZones = zones.filter(hasShape);
  const issues: QualityIssue[] = [];

  for (const response of responses) {
    const base = { responseId: response.id, submittedAt: response.submitted_at, userId: response.user_id ?? null };
    for (const coords of gpsOf(response, gpsQuestionIds)) {
      const outside = outsideZone(coords, usableZones);
      if (outside) issues.push({ ...base, kind: 'outside', detail: outside });
      if (coords.accuracy != null && coords.accuracy > opts.maxAccuracyMeters) {
        issues.push({ ...base, kind: 'accuracy', detail: { key: K + 'accuracy', params: { accuracy: Math.round(coords.accuracy), limit: opts.maxAccuracyMeters } } });
      }
    }
  }

  // Posibles duplicados: mismo recolector, envíos cercanos en el tiempo y en el lugar (o con las mismas respuestas).
  const sorted = responses
    .filter((r) => r.user_id != null && !Number.isNaN(Date.parse(r.submitted_at)))
    .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at));
  const windowMs = opts.duplicateWindowMinutes * 60_000;
  for (let i = 0; i < sorted.length; i++) {
    const later = sorted[i];
    for (let j = i - 1; j >= 0; j--) {
      const earlier = sorted[j];
      const gap = Date.parse(later.submitted_at) - Date.parse(earlier.submitted_at);
      if (gap > windowMs) break;
      if (String(earlier.user_id) !== String(later.user_id)) continue;
      const reason = duplicateReason(earlier, later, gpsQuestionIds, opts.duplicateDistanceMeters);
      if (reason) {
        const minutes = Math.max(1, Math.round(gap / 60_000));
        issues.push({
          responseId: later.id, submittedAt: later.submitted_at, userId: later.user_id ?? null, kind: 'duplicate',
          detail: { key: reason.key, params: { ...reason.params, minutes } },
        });
        break;
      }
    }
  }

  return issues.sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
}

function gpsOf(response: QualityResponse, gpsQuestionIds: string[]): Coords[] {
  const result: Coords[] = [];
  for (const id of gpsQuestionIds) {
    const raw = response.rawAnswers?.[id];
    if (!raw || typeof raw !== 'object') continue;
    const lat = Number(raw.latitude ?? raw.lat);
    const lng = Number(raw.longitude ?? raw.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const accuracy = raw.accuracy != null && Number.isFinite(Number(raw.accuracy)) ? Number(raw.accuracy) : null;
    result.push({ lat, lng, accuracy, raw });
  }
  return result;
}

/** Devuelve el motivo si el punto cae fuera de la zona; null si está dentro o no hay con qué comparar. */
function outsideZone(coords: Coords, zones: QualityZone[]): QualityDetail | null {
  // Lo que registró el teléfono al capturar manda sobre el cálculo de aquí.
  const gf = coords.raw?.geofence;
  if (gf && typeof gf === 'object' && gf.is_inside !== undefined) {
    if (gf.is_inside) return null;
    return describeOutside(gf.zone_name, typeof gf.distance_meters === 'number' ? gf.distance_meters : null);
  }
  if (coords.raw?.is_within_zone !== undefined) {
    if (coords.raw.is_within_zone) return null;
    const distance = coords.raw.distance_to_zone_center_meters;
    return describeOutside(coords.raw.zone_name, typeof distance === 'number' ? distance : null);
  }
  if (zones.length === 0) return null;
  if (zones.some((zone) => insideZone(coords, zone))) return null;
  return zones.length === 1 ? { key: K + 'outsideZone', params: { zone: zones[0].name } } : { key: K + 'outsideAll' };
}

function describeOutside(name: unknown, distance: number | null): QualityDetail {
  const zone = typeof name === 'string' && name ? name : null;
  if (zone) {
    return distance != null
      ? { key: K + 'outsideZoneAt', params: { zone, distance: formatDistance(distance) } }
      : { key: K + 'outsideZone', params: { zone } };
  }
  return distance != null ? { key: K + 'outsideAssignedAt', params: { distance: formatDistance(distance) } } : { key: K + 'outsideAssigned' };
}

function duplicateReason(a: QualityResponse, b: QualityResponse, gpsIds: string[], maxMeters: number): QualityDetail | null {
  const pa = gpsOf(a, gpsIds)[0];
  const pb = gpsOf(b, gpsIds)[0];
  if (pa && pb) {
    const distance = distanceMeters(pa.lat, pa.lng, pb.lat, pb.lng);
    return distance <= maxMeters ? { key: K + 'duplicatePlace', params: { distance: Math.round(distance) } } : null;
  }
  const strip = (answers: Record<string, any>) =>
    JSON.stringify(Object.keys(answers ?? {}).filter((key) => !gpsIds.includes(key)).sort().map((key) => [key, answers[key]]));
  return strip(a.rawAnswers) === strip(b.rawAnswers) ? { key: K + 'duplicateAnswers' } : null;
}

function hasShape(zone: QualityZone): boolean {
  return polygonsOf(zone.geometry_json).length > 0 || (zone.target_lat != null && zone.target_lng != null);
}

function insideZone(coords: Coords, zone: QualityZone): boolean {
  const polygons = polygonsOf(zone.geometry_json);
  if (polygons.length > 0) return polygons.some((rings) => insidePolygon(coords.lng, coords.lat, rings));
  if (zone.target_lat == null || zone.target_lng == null) return false;
  return distanceMeters(coords.lat, coords.lng, zone.target_lat, zone.target_lng) <= zone.radius_meters;
}

type Ring = number[][];

/** Polígonos (cada uno con su anillo exterior y huecos) de un GeoJSON cualquiera. */
function polygonsOf(geometry: unknown): Ring[][] {
  let geo: any = geometry;
  if (typeof geo === 'string') {
    try { geo = JSON.parse(geo); } catch { return []; }
  }
  if (!geo || typeof geo !== 'object') return [];
  switch (geo.type) {
    case 'FeatureCollection': return (geo.features ?? []).flatMap((feature: unknown) => polygonsOf(feature));
    case 'Feature': return polygonsOf(geo.geometry);
    case 'GeometryCollection': return (geo.geometries ?? []).flatMap((item: unknown) => polygonsOf(item));
    case 'Polygon': return Array.isArray(geo.coordinates) ? [geo.coordinates] : [];
    case 'MultiPolygon': return Array.isArray(geo.coordinates) ? geo.coordinates : [];
    default: return [];
  }
}

function insidePolygon(x: number, y: number, rings: Ring[]): boolean {
  const [outer, ...holes] = rings;
  return !!outer && insideRing(x, y, outer) && !holes.some((hole) => insideRing(x, y, hole));
}

function insideRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}
