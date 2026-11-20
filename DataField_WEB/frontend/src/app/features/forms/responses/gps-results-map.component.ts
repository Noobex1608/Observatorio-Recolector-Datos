import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  OnDestroy,
  Output,
  PLATFORM_ID,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import type * as Leaflet from 'leaflet';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

export interface GpsResultPoint {
  /** Identificador estable: respuesta + pregunta. */
  key: string;
  responseId: string;
  question: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  submittedAt?: string;
  collector?: string | null;
}

export interface GpsResultZone {
  id: string;
  name: string;
  target_lat: number | null;
  target_lng: number | null;
  radius_meters: number;
  geometry_json: unknown;
}

/** Colores de Leaflet: no leen variables CSS, se fijan aquí con los valores del sistema. */
const ZONE_COLOR = '#0059a8';

@Component({
  selector: 'app-gps-results-map',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [TranslateModule],
  template: `<div #mapCanvas class="gps-map" role="region" [attr.aria-label]="'forms.responses.page.map.label' | translate"></div>`,
  styles: [`
    app-gps-results-map { display: block; height: 100%; }
    .gps-map { height: 100%; min-height: 0; width: 100%; background: var(--bg-secondary); }
    .gps-map .leaflet-control-zoom a { color: var(--text-primary); }

    .gps-pin {
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      background: #0059a8;
      color: #ffffff;
      font: 700 11px/1 Inter, system-ui, sans-serif;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 2px 6px rgba(9, 30, 56, 0.35);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .gps-pin.is-selected {
      transform: scale(1.25);
      background: #002f5c;
      box-shadow: 0 0 0 3px rgba(0, 89, 168, 0.35), 0 2px 6px rgba(9, 30, 56, 0.35);
    }
    .gps-popup { font: 13px/1.45 Inter, system-ui, sans-serif; color: #12263d; }
    .gps-popup strong { display: block; margin-bottom: 2px; }
    .gps-popup span { display: block; color: #4a5f75; font-variant-numeric: tabular-nums; }
  `],
})
export class GpsResultsMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapCanvas') mapCanvas?: ElementRef<HTMLDivElement>;
  @Input() set points(value: GpsResultPoint[]) { this._points = value; this.render(); }
  @Input() set zones(value: GpsResultZone[]) { this._zones = value; this.render(); }
  @Input() set selectedKey(value: string | null) {
    const changed = value !== this._selected;
    this._selected = value;
    this.highlight(changed);
  }
  @Output() readonly pointSelected = new EventEmitter<string>();

  private _points: GpsResultPoint[] = [];
  private _zones: GpsResultZone[] = [];
  private _selected: string | null = null;
  private leaflet?: typeof Leaflet;
  private map?: Leaflet.Map;
  private overlays?: Leaflet.LayerGroup;
  private accuracyLayer?: Leaflet.LayerGroup;
  private markers = new Map<string, Leaflet.Marker>();
  private bounds?: Leaflet.LatLngBounds;
  private resizeObserver?: ResizeObserver;

  constructor(@Inject(PLATFORM_ID) private platformId: object, private i18n: TranslateService) {}

  ngAfterViewInit(): void {
    void this.prepararMapa();
  }

  private async prepararMapa(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.mapCanvas) return;
    this.leaflet = await import('leaflet');
    this.map = this.leaflet.map(this.mapCanvas.nativeElement).setView([-1.0, -80.7], 11);
    this.leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(this.map);
    this.overlays = this.leaflet.layerGroup().addTo(this.map);
    this.accuracyLayer = this.leaflet.layerGroup().addTo(this.map);
    this.render();
    this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
    this.resizeObserver.observe(this.mapCanvas.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  /** Encuadra todas las zonas y puntos. */
  fitAll(): void {
    if (this.map && this.bounds?.isValid()) this.map.fitBounds(this.bounds.pad(0.12), { maxZoom: 17 });
  }

  private render(): void {
    const L = this.leaflet;
    if (!L || !this.map || !this.overlays) return;
    this.overlays.clearLayers();
    this.markers.clear();
    const bounds = L.latLngBounds([]);
    for (const zone of this._zones) {
      const style = { color: ZONE_COLOR, weight: 2, fillColor: ZONE_COLOR, fillOpacity: 0.08 };
      if (zone.geometry_json && typeof zone.geometry_json === 'object') {
        try {
          const geo = L.geoJSON(zone.geometry_json as GeoJSON.GeoJsonObject, { style });
          geo.bindTooltip(zone.name, { sticky: true });
          geo.addTo(this.overlays);
          bounds.extend(geo.getBounds());
        } catch { /* La zona de radio sigue disponible. */ }
      } else if (zone.target_lat != null && zone.target_lng != null) {
        const circle = L.circle([zone.target_lat, zone.target_lng], { ...style, radius: zone.radius_meters })
          .bindTooltip(zone.name, { sticky: true })
          .addTo(this.overlays);
        bounds.extend(circle.getBounds());
      }
    }
    this._points.forEach((point, index) => {
      const marker = L.marker([point.latitude, point.longitude], {
        icon: this.pinIcon(index + 1, point.key === this._selected),
        keyboard: true,
        title: this.i18n.instant('forms.responses.page.map.markerTitle', { number: index + 1, question: point.question }),
        riseOnHover: true,
      }).addTo(this.overlays!);
      marker.bindPopup(this.popupFor(point, index + 1), { closeButton: false, offset: [0, -8] });
      marker.on('click', () => this.pointSelected.emit(point.key));
      this.markers.set(point.key, marker);
      bounds.extend([point.latitude, point.longitude]);
    });
    this.bounds = bounds;
    this.fitAll();
    this.highlight(false);
  }

  private highlight(focus: boolean): void {
    const L = this.leaflet;
    if (!L || !this.map || !this.accuracyLayer) return;
    this.accuracyLayer.clearLayers();
    this._points.forEach((point, index) => {
      this.markers.get(point.key)?.setIcon(this.pinIcon(index + 1, point.key === this._selected));
    });
    const point = this._points.find((item) => item.key === this._selected);
    const marker = point ? this.markers.get(point.key) : undefined;
    if (!point || !marker) return;
    marker.setZIndexOffset(1000);
    if (point.accuracy) {
      L.circle([point.latitude, point.longitude], {
        radius: point.accuracy, color: ZONE_COLOR, weight: 1, dashArray: '4 4', fillColor: ZONE_COLOR, fillOpacity: 0.06,
        interactive: false,
      }).addTo(this.accuracyLayer);
    }
    if (focus) {
      this.map.flyTo([point.latitude, point.longitude], Math.max(this.map.getZoom(), 17), { duration: 0.6 });
      marker.openPopup();
    }
  }

  private pinIcon(number: number, selected: boolean): Leaflet.DivIcon {
    return this.leaflet!.divIcon({
      className: '',
      html: `<span class="gps-pin${selected ? ' is-selected' : ''}">${number}</span>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  private popupFor(point: GpsResultPoint, number: number): HTMLElement {
    const box = document.createElement('div');
    box.className = 'gps-popup';
    const title = document.createElement('strong');
    title.textContent = `${number}. ${point.collector ?? point.question}`;
    const coords = document.createElement('span');
    coords.textContent = `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}${point.accuracy == null ? '' : ` · ±${point.accuracy} m`}`;
    box.append(title, coords);
    return box;
  }
}
