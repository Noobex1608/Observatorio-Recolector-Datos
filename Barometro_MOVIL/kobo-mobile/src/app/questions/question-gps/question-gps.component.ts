import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  effect,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormQuestion } from '../../db.service';
import { LocationService, GpsLocationPayload } from '../../services/location.service';

export type GpsStatus = 'idle' | 'locating' | 'success' | 'error' | 'manual';

@Component({
  selector: 'app-question-gps',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './question-gps.component.html',
  styleUrls: ['./question-gps.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuestionGpsComponent {
  private locationService = inject(LocationService);

  // Signal Inputs
  question = input.required<FormQuestion>();
  value = input<GpsLocationPayload | null>(null);
  disabled = input<boolean>(false);

  // Signal Output
  valueChange = output<GpsLocationPayload | null>();

  // Reactive State Signals
  readonly status = signal<GpsStatus>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly currentLocation = signal<GpsLocationPayload | null>(null);
  readonly observationNotes = signal<string>('');

  // Manual input fields
  manualLat = signal<number | null>(null);
  manualLng = signal<number | null>(null);

  // Designated Zone / Geofencing Computed Signals
  readonly geofenceConfig = computed(() => {
    const props = this.question().properties;
    const gf = props?.['geofencing'] || props?.geofencing;
    if (gf && typeof gf === 'object') {
      return {
        name: gf.name || props?.zone_name || 'Zona Asignada',
        lat: gf.lat ?? props?.target_lat ?? null,
        lng: gf.lng ?? props?.target_lng ?? null,
        radius: gf.radius ?? props?.radius_meters ?? 500,
      };
    }
    if (
      props?.target_lat !== undefined &&
      props?.target_lat !== null &&
      props?.target_lng !== undefined &&
      props?.target_lng !== null
    ) {
      return {
        name: props.zone_name || 'Zona Asignada',
        lat: props.target_lat,
        lng: props.target_lng,
        radius: props.radius_meters || 500,
      };
    }
    return null;
  });

  readonly hasDesignatedZone = computed<boolean>(() => {
    return this.geofenceConfig() !== null;
  });

  readonly zoneName = computed<string>(() => {
    return this.geofenceConfig()?.name || 'Zona Asignada';
  });

  readonly targetLat = computed<number | null>(() => {
    return this.geofenceConfig()?.lat ?? null;
  });

  readonly targetLng = computed<number | null>(() => {
    return this.geofenceConfig()?.lng ?? null;
  });

  readonly targetRadius = computed<number>(() => {
    return this.geofenceConfig()?.radius ?? 500;
  });

  readonly distanceToZone = computed<number | null>(() => {
    const loc = this.currentLocation();
    const lat2 = this.targetLat();
    const lng2 = this.targetLng();
    if (!loc || lat2 === null || lng2 === null) return null;
    return this.calculateDistanceMeters(loc.latitude, loc.longitude, lat2, lng2);
  });

  readonly isWithinZone = computed<boolean | null>(() => {
    const dist = this.distanceToZone();
    const radius = this.targetRadius();
    if (dist === null) return null;
    return dist <= radius;
  });

  readonly formattedZoneDistance = computed<string | null>(() => {
    const dist = this.distanceToZone();
    if (dist === null) return null;
    if (dist < 1000) return `${dist} m`;
    return `${(dist / 1000).toFixed(2)} km`;
  });

  // Accuracy computed signals
  readonly accuracyClass = computed(() => {
    const loc = this.currentLocation();
    if (!loc) return 'accuracy-unknown';
    if (loc.accuracy <= 10) return 'accuracy-high';
    if (loc.accuracy <= 30) return 'accuracy-medium';
    return 'accuracy-low';
  });

  readonly accuracyLevel = computed<'high' | 'medium' | 'low' | 'unknown'>(() => {
    const loc = this.currentLocation();
    if (!loc) return 'unknown';
    if (loc.accuracy <= 10) return 'high';
    if (loc.accuracy <= 30) return 'medium';
    return 'low';
  });

  readonly formattedTime = computed(() => {
    const loc = this.currentLocation();
    if (!loc?.timestamp) return null;
    try {
      const date = new Date(loc.timestamp);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return null;
    }
  });

  readonly googleMapsUrl = computed(() => {
    const loc = this.currentLocation();
    if (!loc) return null;
    const tLat = this.targetLat();
    const tLng = this.targetLng();

    if (tLat !== null && tLng !== null) {
      return `https://www.google.com/maps/dir/${loc.latitude},${loc.longitude}/${tLat},${tLng}`;
    }

    return `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
  });

  readonly isPermissionDenied = computed(() => {
    return this.locationService.permissionStatus() === 'denied';
  });

  constructor() {
    effect(() => {
      const val = this.value();
      if (val) {
        this.currentLocation.set(val);
        if (val.notes) {
          this.observationNotes.set(val.notes);
        }
        this.status.set('success');
      }
    });
  }

  calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  // Alias for backward compatibility
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return this.calculateDistanceMeters(lat1, lon1, lat2, lon2);
  }

  async captureLocation(): Promise<void> {
    if (this.disabled()) return;

    this.status.set('locating');
    this.errorMessage.set(null);

    try {
      const location = await this.locationService.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000
      });

      const payload = this.enrichPayload(location);
      this.currentLocation.set(payload);
      this.status.set('success');
      this.valueChange.emit(payload);
    } catch (err: any) {
      this.status.set('error');
      this.errorMessage.set(err?.message || 'No se pudo obtener la ubicación GPS.');
    }
  }

  enableManualEntry(): void {
    if (this.disabled()) return;
    this.status.set('manual');
    if (this.currentLocation()) {
      this.manualLat.set(this.currentLocation()?.latitude ?? null);
      this.manualLng.set(this.currentLocation()?.longitude ?? null);
    }
  }

  saveManualLocation(): void {
    const lat = this.manualLat();
    const lng = this.manualLng();

    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
      this.errorMessage.set('Por favor, ingrese coordenadas de latitud y longitud válidas.');
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      this.errorMessage.set('La latitud debe estar entre -90 y 90, y la longitud entre -180 y 180.');
      return;
    }

    const basePayload: GpsLocationPayload = {
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      altitude: null,
      accuracy: 0,
      timestamp: new Date().toISOString(),
      formatted: `${lat.toFixed(6)}, ${lng.toFixed(6)} (Ingreso Manual)`
    };

    const manualPayload = this.enrichPayload(basePayload);
    this.currentLocation.set(manualPayload);
    this.status.set('success');
    this.errorMessage.set(null);
    this.valueChange.emit(manualPayload);
  }

  onNotesChange(notesText: string): void {
    this.observationNotes.set(notesText);
    const loc = this.currentLocation();
    if (loc) {
      const updatedPayload = { ...loc, notes: notesText };
      this.currentLocation.set(updatedPayload);
      this.valueChange.emit(updatedPayload);
    }
  }

  private enrichPayload(base: GpsLocationPayload): GpsLocationPayload {
    const config = this.geofenceConfig();
    let geofenceData: GpsLocationPayload['geofence'] = null;
    let dist: number | undefined = undefined;
    let isWithin: boolean | undefined = undefined;

    if (config && config.lat !== null && config.lng !== null) {
      dist = this.calculateDistanceMeters(base.latitude, base.longitude, config.lat, config.lng);
      isWithin = dist <= config.radius;
      geofenceData = {
        zone_name: config.name,
        is_inside: isWithin,
        distance_meters: dist,
        allowed_radius_meters: config.radius
      };
    }

    return {
      ...base,
      lat: base.latitude,
      lng: base.longitude,
      notes: this.observationNotes() || undefined,
      is_within_zone: isWithin,
      distance_to_zone_center_meters: dist,
      zone_name: config?.name,
      geofence: geofenceData
    };
  }

  clearLocation(): void {
    if (this.disabled()) return;
    this.currentLocation.set(null);
    this.status.set('idle');
    this.errorMessage.set(null);
    this.manualLat.set(null);
    this.manualLng.set(null);
    this.observationNotes.set('');
    this.valueChange.emit(null);
  }
}
