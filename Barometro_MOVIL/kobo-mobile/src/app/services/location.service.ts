import { Injectable, signal } from '@angular/core';

export interface GpsLocationPayload {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  timestamp: string;
  formatted?: string;
}

export interface GpsOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

@Injectable({ providedIn: 'root' })
export class LocationService {
  readonly permissionStatus = signal<'granted' | 'prompt' | 'denied' | 'unsupported'>('prompt');
  readonly isSupported = signal<boolean>('geolocation' in navigator);

  constructor() {
    this.checkPermissionStatus();
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

  getCurrentPosition(options: GpsOptions = {}): Promise<GpsLocationPayload> {
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
        reject(new Error('Se agotó el tiempo de espera (12s) para obtener fijación de satélites GPS. Puede utilizar el ingreso manual.'));
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
              errorMessage = 'Se agotó el tiempo de espera para obtener la ubicación de alta precisión.';
              break;
          }
          reject(new Error(errorMessage));
        },
        defaultOptions
      );
    });
  }
}
