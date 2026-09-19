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

  // Manual input fields
  manualLat = signal<number | null>(null);
  manualLng = signal<number | null>(null);

  // Computed signals
  readonly accuracyClass = computed(() => {
    const loc = this.currentLocation();
    if (!loc) return 'accuracy-unknown';
    if (loc.accuracy <= 10) return 'accuracy-high';
    if (loc.accuracy <= 30) return 'accuracy-medium';
    return 'accuracy-low';
  });

  readonly isPermissionDenied = computed(() => {
    return this.locationService.permissionStatus() === 'denied';
  });

  constructor() {
    effect(() => {
      const val = this.value();
      if (val) {
        this.currentLocation.set(val);
        this.status.set('success');
      }
    });
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

      this.currentLocation.set(location);
      this.status.set('success');
      this.valueChange.emit(location);
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

    const manualPayload: GpsLocationPayload = {
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      altitude: null,
      accuracy: 0,
      timestamp: new Date().toISOString(),
      formatted: `${lat.toFixed(6)}, ${lng.toFixed(6)} (Ingreso Manual)`
    };

    this.currentLocation.set(manualPayload);
    this.status.set('success');
    this.errorMessage.set(null);
    this.valueChange.emit(manualPayload);
  }

  clearLocation(): void {
    if (this.disabled()) return;
    this.currentLocation.set(null);
    this.status.set('idle');
    this.errorMessage.set(null);
    this.manualLat.set(null);
    this.manualLng.set(null);
    this.valueChange.emit(null);
  }
}
