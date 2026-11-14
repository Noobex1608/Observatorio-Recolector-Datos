import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, PLATFORM_ID, effect, inject, input, output, viewChild } from '@angular/core';
import type * as Leaflet from 'leaflet';
import { RouteSurvey, RouteZone } from '@core/services/project.service';

export const ROUTE_COLORS = { inside: '#16805c', outside: '#bc1421', unknown: '#0059a8', weak: '#8a99ab', zone: '#2563eb' };

/** Mapa del recorrido: zonas, trazado de cada encuesta coloreado dentro/fuera y traslados entre encuestas. */
@Component({
  selector: 'app-route-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #canvas class="route-map" role="img" [attr.aria-label]="label()"></div>`,
  styles: [`
    :host { display: block; }
    .route-map { height: 100%; min-height: 420px; width: 100%; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--card-border); }
    :host ::ng-deep .route-pin {
      display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%;
      color: #fff; font: 700 12px/1 system-ui, sans-serif; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4);
    }
    :host ::ng-deep .route-pin.end { border-radius: 6px; }
  `],
})
export class RouteMapComponent implements AfterViewInit, OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private canvas = viewChild<ElementRef<HTMLDivElement>>('canvas');

  zones = input<RouteZone[]>([]);
  surveys = input<RouteSurvey[]>([]);
  selectedId = input<string | null>(null);
  surveySelect = output<string>();

  private L?: typeof Leaflet;
  private map?: Leaflet.Map;
  private layer?: Leaflet.LayerGroup;
  private boundsBySurvey = new Map<string, Leaflet.LatLngBounds>();
  private allBounds?: Leaflet.LatLngBounds;
  private lastFitKey = '';

  label(): string {
    const count = this.surveys().length;
    return `Mapa del recorrido con ${count} encuesta${count === 1 ? '' : 's'}. La lista de encuestas tiene el mismo detalle.`;
  }

  constructor() {
    effect(() => {
      this.zones();
      this.surveys();
      this.selectedId();
      this.render();
    });
  }

  ngAfterViewInit(): void {
    void this.prepararMapa();
  }

  private async prepararMapa(): Promise<void> {
    const element = this.canvas()?.nativeElement;
    if (!isPlatformBrowser(this.platformId) || !element) return;
    this.L = await import('leaflet');
    this.map = this.L.map(element).setView([-1.0, -80.7], 12);
    this.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(this.map);
    this.layer = this.L.layerGroup().addTo(this.map);
    this.render();
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private render(): void {
    const L = this.L;
    if (!L || !this.map || !this.layer) return;
    this.layer.clearLayers();
    this.boundsBySurvey.clear();
    const all = L.latLngBounds([]);
    const selected = this.selectedId();

    for (const zone of this.zones()) {
      let shape: Leaflet.Layer & { getBounds(): Leaflet.LatLngBounds } | null = null;
      if (zone.geometry_json && typeof zone.geometry_json === 'object') {
        try { shape = L.geoJSON(zone.geometry_json as GeoJSON.GeoJsonObject, { style: { color: ROUTE_COLORS.zone, weight: 2, fillOpacity: 0.07 } }); }
        catch { shape = null; }
      }
      if (!shape && zone.target_lat != null && zone.target_lng != null) {
        shape = L.circle([zone.target_lat, zone.target_lng], { radius: zone.radius_meters || 500, color: ROUTE_COLORS.zone, weight: 2, fillOpacity: 0.07 });
      }
      if (shape) {
        shape.bindTooltip(`Zona: ${zone.name}`);
        shape.addTo(this.layer);
        all.extend(shape.getBounds());
      }
    }

    let previousEnd: Leaflet.LatLngExpression | null = null;
    this.surveys().forEach((survey, index) => {
      const path = survey.path;
      if (!path.length) return;
      const dimmed = !!selected && selected !== survey.id;
      const opacity = dimmed ? 0.25 : 1;
      const start: Leaflet.LatLngTuple = [path[0][0], path[0][1]];
      const end: Leaflet.LatLngTuple = [path[path.length - 1][0], path[path.length - 1][1]];
      if (previousEnd) {
        L.polyline([previousEnd, start], { color: ROUTE_COLORS.weak, weight: 2, dashArray: '6 8', opacity: dimmed ? 0.2 : 0.8 })
          .bindTooltip('Traslado entre encuestas (no registrado)').addTo(this.layer!);
      }
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const color = !b[5] ? ROUTE_COLORS.weak : b[4] === false || a[4] === false ? ROUTE_COLORS.outside : b[4] === true ? ROUTE_COLORS.inside : ROUTE_COLORS.unknown;
        L.polyline([[a[0], a[1]], [b[0], b[1]]], { color, weight: selected === survey.id ? 6 : 4, opacity })
          .on('click', () => this.surveySelect.emit(survey.id)).addTo(this.layer!);
      }
      // Puntos intermedios: cada vez que se retomó el borrador.
      for (const point of path.slice(1, -1)) {
        const where = point[4] === false ? 'fuera de zona' : point[4] === true ? 'dentro de la zona' : 'sin zona';
        L.circleMarker([point[0], point[1]], {
          radius: 6, color: point[4] === false ? ROUTE_COLORS.outside : ROUTE_COLORS.unknown, fillColor: '#fff', fillOpacity: 1, weight: 3, opacity,
        })
          .bindTooltip(`Encuesta ${index + 1} · ${point[6] === 'reanudar' ? 'retomó el borrador' : 'punto'} ${new Date(point[3]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${where}${point[2] != null ? ` · ±${point[2]} m` : ''}`)
          .on('click', () => this.surveySelect.emit(survey.id)).addTo(this.layer!);
      }
      const pinColor = survey.alerts.some((a) => a.code === 'fuera_de_zona' || a.code === 'salio_de_zona' || a.code === 'excepcion_zona')
        ? ROUTE_COLORS.outside : ROUTE_COLORS.inside;
      const startTime = new Date(survey.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      L.marker(start, { opacity, icon: L.divIcon({ className: '', html: `<span class="route-pin" style="background:${pinColor}">${index + 1}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) })
        .bindTooltip(`Encuesta ${index + 1} · inicio ${startTime}`)
        .on('click', () => this.surveySelect.emit(survey.id)).addTo(this.layer!);
      if (path.length > 1) {
        const last = path[path.length - 1];
        const endColor = last[4] === false ? ROUTE_COLORS.outside : '#24384f';
        L.marker(end, { opacity, icon: L.divIcon({ className: '', html: `<span class="route-pin end" style="background:${endColor}">■</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) })
          .bindTooltip(`Encuesta ${index + 1} · ${last[6] === 'fin' ? 'fin' : 'último punto'} ${new Date(last[3]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${last[4] === false ? ' · fuera de zona' : ''}`).on('click', () => this.surveySelect.emit(survey.id)).addTo(this.layer!);
      }
      const bounds = L.latLngBounds(path.map((p) => [p[0], p[1]] as Leaflet.LatLngTuple));
      this.boundsBySurvey.set(survey.id, bounds);
      all.extend(bounds);
      previousEnd = end;
    });
    this.allBounds = all;

    const key = `${selected ?? 'all'}|${this.surveys().map((s) => s.id).join(',')}`;
    if (key !== this.lastFitKey) {
      this.lastFitKey = key;
      const target = (selected && this.boundsBySurvey.get(selected)) || all;
      if (target.isValid()) this.map.fitBounds(target.pad(0.2), { maxZoom: 18 });
    }
  }
}
