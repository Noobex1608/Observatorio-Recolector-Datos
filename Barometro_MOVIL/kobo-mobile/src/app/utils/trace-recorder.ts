/**
 * Trazado GPS de una encuesta por eventos: un punto al iniciarla, uno cada vez que se retoma
 * el borrador y uno al finalizarla. Viaja dentro de la respuesta (`_location_trace`), así funciona
 * sin internet y se sincroniza junto con ella.
 */
export type TraceEvent = 'inicio' | 'reanudar' | 'fin';

export interface LocationTrace {
  started_at: string;
  ended_at: string | null;
  /** [latitud, longitud, precisión en metros, epoch en ms, evento] */
  points: [number, number, number | null, number, TraceEvent][];
}

export const TRACE_KEY = '_location_trace';
/** Lecturas con más error que esto se descartan. */
export const MAX_ACCURACY_METERS = 100;
const MAX_POINTS = 200;

export function isTrace(value: unknown): value is LocationTrace {
  return !!value && typeof value === 'object' && Array.isArray((value as LocationTrace).points)
    && typeof (value as LocationTrace).started_at === 'string';
}

type Locate = (timeoutMs: number) => Promise<{ latitude: number; longitude: number; accuracy: number | null; timestamp: number }>;

const browserLocate: Locate = (timeoutMs) => new Promise((resolve, reject) => {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    reject(new Error('GPS no disponible'));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    position => resolve({
      latitude: position.coords.latitude, longitude: position.coords.longitude,
      accuracy: position.coords.accuracy, timestamp: position.timestamp,
    }),
    reject,
    { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 },
  );
});

export class TraceRecorder {
  private trace: LocationTrace;

  constructor(previous?: unknown, private readonly locate: Locate = browserLocate) {
    this.trace = isTrace(previous)
      ? { started_at: previous.started_at, ended_at: null, points: previous.points.map(p => [...p] as LocationTrace['points'][number]) }
      : { started_at: new Date().toISOString(), ended_at: null, points: [] };
  }

  get points(): number {
    return this.trace.points.length;
  }

  /**
   * Toma un punto para el evento. Si no hay señal, permiso o la lectura es imprecisa, la encuesta
   * sigue sin ese punto (devuelve false).
   */
  async capture(event: TraceEvent, timeoutMs = 20000): Promise<boolean> {
    try {
      const position = await this.locate(timeoutMs);
      return this.add(position.latitude, position.longitude, position.accuracy, event, position.timestamp);
    } catch {
      return false;
    }
  }

  add(latitude: number, longitude: number, accuracy: number | null, event: TraceEvent, timestamp: number = Date.now()): boolean {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy > MAX_ACCURACY_METERS)) return false;
    if (this.trace.points.length >= MAX_POINTS) return false;
    this.trace.points.push([
      Number(latitude.toFixed(6)), Number(longitude.toFixed(6)),
      accuracy === null ? null : Number(accuracy.toFixed(1)), Math.round(timestamp), event,
    ]);
    return true;
  }

  /** Copia lista para guardar en la respuesta; `finish` marca la hora de fin. */
  snapshot(finish = false): LocationTrace {
    return {
      started_at: this.trace.started_at,
      ended_at: finish ? new Date().toISOString() : null,
      points: this.trace.points.map(p => [...p] as LocationTrace['points'][number]),
    };
  }
}
