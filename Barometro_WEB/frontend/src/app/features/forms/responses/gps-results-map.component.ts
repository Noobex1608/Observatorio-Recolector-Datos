import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Inject, Input, OnDestroy, PLATFORM_ID, ViewChild } from '@angular/core';
import type * as Leaflet from 'leaflet';

export interface GpsResultPoint {
  responseId: string;
  question: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export interface GpsResultZone {
  id: string;
  name: string;
  target_lat: number | null;
  target_lng: number | null;
  radius_meters: number;
  geometry_json: unknown;
}

@Component({
  selector: 'app-gps-results-map',
  standalone: true,
  template: `<div #mapCanvas class="gps-map" aria-label="Mapa de respuestas GPS"></div>`,
  styles: [`.gps-map { height: 400px; width: 100%; border-radius: 12px; overflow: hidden; }`],
})
export class GpsResultsMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapCanvas') mapCanvas?: ElementRef<HTMLDivElement>;
  @Input() set points(value: GpsResultPoint[]) { this._points = value; this.render(); }
  @Input() set zones(value: GpsResultZone[]) { this._zones = value; this.render(); }

  private _points: GpsResultPoint[] = [];
  private _zones: GpsResultZone[] = [];
  private leaflet?: typeof Leaflet;
  private map?: Leaflet.Map;
  private overlays?: Leaflet.LayerGroup;

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.mapCanvas) return;
    this.leaflet = await import('leaflet');
    this.map = this.leaflet.map(this.mapCanvas.nativeElement).setView([-1.0, -80.7], 11);
    this.leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(this.map);
    this.overlays = this.leaflet.layerGroup().addTo(this.map);
    this.render();
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  ngOnDestroy(): void { this.map?.remove(); }

  private render(): void {
    const L = this.leaflet;
    if (!L || !this.map || !this.overlays) return;
    this.overlays.clearLayers();
    const bounds = L.latLngBounds([]);
    for (const zone of this._zones) {
      if (zone.geometry_json && typeof zone.geometry_json === 'object') {
        try {
          const geo = L.geoJSON(zone.geometry_json as GeoJSON.GeoJsonObject, { style: { color: '#2563eb', fillOpacity: 0.08 } });
          geo.addTo(this.overlays);
          bounds.extend(geo.getBounds());
        } catch { /* La zona de radio sigue disponible. */ }
      } else if (zone.target_lat != null && zone.target_lng != null) {
        const circle = L.circle([zone.target_lat, zone.target_lng], {
          radius: zone.radius_meters, color: '#2563eb', fillOpacity: 0.08,
        }).addTo(this.overlays);
        bounds.extend(circle.getBounds());
      }
    }
    for (const point of this._points) {
      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: 7, color: '#004499', fillColor: '#46a4ff', fillOpacity: 0.9,
      }).addTo(this.overlays);
      const popup = document.createElement('div');
      popup.textContent = `${point.question} · X: ${point.longitude.toFixed(6)} · Y: ${point.latitude.toFixed(6)}${point.accuracy == null ? '' : ` · ±${point.accuracy} m`}`;
      marker.bindPopup(popup);
      bounds.extend([point.latitude, point.longitude]);
    }
    if (bounds.isValid()) this.map.fitBounds(bounds.pad(0.12));
  }
}
