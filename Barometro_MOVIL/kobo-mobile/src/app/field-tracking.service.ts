import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { DbService, PendingFieldTracking } from './db.service';
import { LocationService } from './services/location.service';

const ACTIVE_KEY = 'field_tracking_active_shift';

@Injectable({ providedIn: 'root' })
export class FieldTrackingService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private db = inject(DbService);
  private location = inject(LocationService);
  readonly active = signal<{ formId: string; zoneId: string } | null>(this.savedShift());
  readonly error = signal('');
  private timer: ReturnType<typeof setInterval> | null = null;
  private capturing = false;

  constructor() {
    if (this.active()) this.beginTimer();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { void this.flush(); });
      window.addEventListener('field-tracking-logout', () => {
        this.active.set(null);
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.error.set('');
      });
    }
  }

  async start(formId: string, zoneId: string): Promise<void> {
    const server = this.auth.obtenerUrlServidor();
    if (!server || this.auth.esModoDemo()) throw new Error('Se requiere conexión con el servidor para iniciar la jornada.');
    if (!navigator.onLine) throw new Error('Conéctese a internet para iniciar la jornada.');
    let currentForm;
    try {
      currentForm = await this.api.fetchFormById(server, formId);
    } catch (error: any) {
      if (error?.status === 403 || error?.status === 404) {
        await this.db.forms.update(formId, { project_zones: [] });
        throw new Error('Ya no tienes acceso a este formulario. Solicita al líder que revise tu asignación.');
      }
      throw error;
    }
    const zones = currentForm.project_zones ?? [];
    await this.db.forms.update(formId, { project_zones: zones });
    if (currentForm.state !== 'DEPLOYED') {
      throw new Error('El formulario ya no está publicado. Solicita al líder que revise su estado.');
    }
    if (!zones.some(zone => zone.id === zoneId)) {
      throw new Error('La zona seleccionada ya no está asignada a tu cuenta. Solicita al líder que delimite y asigne una zona.');
    }
    if (this.active()) await this.stop();
    await this.flush();
    await this.api.startFieldTracking(server, formId, zoneId);
    const shift = { formId, zoneId };
    this.active.set(shift);
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(shift));
    this.error.set('');
    this.beginTimer();
    await this.capture();
  }

  async stop(): Promise<void> {
    const shift = this.active();
    if (!shift) return;
    this.active.set(null);
    localStorage.removeItem(ACTIVE_KEY);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.db.pendingFieldTracking.add({ kind: 'stop', formId: shift.formId, createdAt: new Date().toISOString() });
    await this.flush();
  }

  async flush(): Promise<void> {
    const server = this.auth.obtenerUrlServidor();
    if (!server || !navigator.onLine || this.auth.esModoDemo()) return;
    const queue = await this.db.pendingFieldTracking.orderBy('id').toArray();
    for (const item of queue) {
      try {
        if (item.kind === 'report' && item.payload) {
          if (Date.now() - new Date(item.payload.recorded_at).getTime() < 24 * 60 * 60 * 1000) {
            await this.api.reportFieldLocation(server, item.payload);
          }
        } else if (item.kind === 'stop') {
          await this.api.stopFieldTracking(server, item.formId);
        }
        if (item.id !== undefined) await this.db.pendingFieldTracking.delete(item.id);
      } catch { break; }
    }
  }

  private beginTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => { void this.capture(); }, 30000);
  }

  private async capture(): Promise<void> {
    const shift = this.active();
    if (!shift || this.capturing || document.visibilityState !== 'visible') return;
    this.capturing = true;
    try {
      const position = await this.location.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      const item: PendingFieldTracking = {
        kind: 'report', formId: shift.formId, createdAt: new Date().toISOString(),
        payload: {
          form_id: shift.formId, zone_id: shift.zoneId,
          latitude: position.latitude, longitude: position.longitude,
          accuracy_meters: position.accuracy, recorded_at: position.timestamp,
        },
      };
      await this.db.pendingFieldTracking.add(item);
      await this.flush();
      this.error.set('');
    } catch (error: any) {
      this.error.set(error?.message || 'No se pudo obtener la posición GPS.');
    } finally {
      this.capturing = false;
    }
  }

  private savedShift(): { formId: string; zoneId: string } | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const value = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
      return value?.formId && value?.zoneId ? value : null;
    } catch { return null; }
  }
}
