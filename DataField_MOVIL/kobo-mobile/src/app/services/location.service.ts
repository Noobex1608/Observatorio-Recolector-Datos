import { Injectable, signal } from '@angular/core';

export interface GpsLocationPayload {
  latitude: number;
  longitude: number;
  lat?: number;
  lng?: number;
  altitude: number | null;
  accuracy: number;
  timestamp: string;
  formatted?: string;
  notes?: string;
  is_within_zone?: boolean;
  distance_to_zone_center_meters?: number;
  zone_name?: string;
  geofence?: {
    zone_name: string;
    is_inside: boolean;
    distance_meters: number;
    allowed_radius_meters: number;
  } | null;
}

/** Tiempo agotado esperando la ubicación (permite reintentar con menor precisión). */
export class GpsTimeoutError extends Error {}

export interface GpsOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

@Injectable({ providedIn: 'root' })
export class LocationService {
  readonly permissionStatus = signal<'granted' | 'prompt' | 'denied' | 'unsupported'>('prompt');
  readonly isSupported = signal<boolean>('geolocation' in navigator);

  /** Consulta el permiso una sola vez, de forma diferida (no en el constructor). */
  private permissionChecked = false;

  private ensurePermissionStatus(): void {
    if (this.permissionChecked) return;
    this.permissionChecked = true;
    this.checkPermissionStatus().catch(() => this.permissionStatus.set('prompt'));
  }

  async checkPermissionStatus(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
    if (!('geolocation' in navigator)) {
      this.permissionStatus.set('unsupported');
      return 'unsupported';
    }

    if ('permissions' in navigator && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        this.permissionStatus.set(result.state);
        result.onchange = () => {
          this.permissionStatus.set(result.state);
        };
        return result.state;
      } catch {
        // Fallback if query fails
      }
    }

    return this.permissionStatus();
  }

  /**
   * Ubicación actual. Si la fijación satelital (alta precisión) agota el tiempo, reintenta una vez
   * con la ubicación de red/caché reciente, que funciona sin datos móviles y responde antes.
   */
  async getCurrentPosition(options: GpsOptions = {}): Promise<GpsLocationPayload> {
    try {
      return await this.requestPosition(options);
    } catch (error) {
      if (!(error instanceof GpsTimeoutError) || options.enableHighAccuracy === false) throw error;
      return this.requestPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 });
    }
  }

  private requestPosition(options: GpsOptions = {}): Promise<GpsLocationPayload> {
    this.ensurePermissionStatus();
    const timeoutMs = options.timeout ?? 12000;
    const defaultOptions: PositionOptions = {
      enableHighAccuracy: options.enableHighAccuracy ?? true,
      timeout: timeoutMs,
      maximumAge: options.maximumAge ?? 0
    };

    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        this.permissionStatus.set('unsupported');
        reject(new Error('La geolocalización no está soportada por este navegador/dispositivo.'));
        return;
      }

      let timerId: any = setTimeout(() => {
        timerId = null;
        reject(new GpsTimeoutError(`Se agotó el tiempo de espera (${Math.round(timeoutMs / 1000)} s) para obtener la ubicación. Reintente en un lugar abierto o use el ingreso manual.`));
      }, timeoutMs + 1000);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (timerId) {
            clearTimeout(timerId);
            timerId = null;
          }
          this.permissionStatus.set('granted');
          const coords = position.coords;
          const payload: GpsLocationPayload = {
            latitude: Number(coords.latitude.toFixed(6)),
            longitude: Number(coords.longitude.toFixed(6)),
            altitude: coords.altitude !== null ? Number(coords.altitude.toFixed(2)) : null,
            accuracy: Number(coords.accuracy.toFixed(1)),
            timestamp: new Date(position.timestamp).toISOString(),
            formatted: `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} (±${coords.accuracy.toFixed(1)}m)`
          };
          resolve(payload);
        },
        (error: GeolocationPositionError) => {
          if (timerId) {
            clearTimeout(timerId);
            timerId = null;
          }
          let errorMessage = 'Error desconocido al obtener la ubicación GPS.';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              this.permissionStatus.set('denied');
              errorMessage = 'Permiso de ubicación denegado. Por favor, habilite el acceso GPS en los ajustes de su navegador.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Información de ubicación no disponible. Verifique que el GPS esté activo.';
              break;
            case error.TIMEOUT:
              reject(new GpsTimeoutError('Se agotó el tiempo de espera para obtener la ubicación de alta precisión.'));
              return;
          }
          reject(new Error(errorMessage));
        },
        defaultOptions
      );
    });
  }
}
