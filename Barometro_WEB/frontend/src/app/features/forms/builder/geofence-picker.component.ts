import {
  Component,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  input,
  output,
  signal,
  effect,
  computed,
  viewChild,
  inject,
  PLATFORM_ID,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { GisService, GisSelection, DpaCanton, DpaParroquia } from '@core/services/gis.service';

export interface GeofenceChangeEvent {
  zone_name: string;
  target_lat: number | null;
  target_lng: number | null;
  radius_meters: number;
  geofencing: {
    name: string;
    lat: number | null;
    lng: number | null;
    radius: number;
    geofence_type?: 'manzana_polygon' | 'circular_radius';
    polygon_geometry?: any;
  };
  inec_hierarchy?: {
    provincia?: string;
    canton?: string;
    parroquia?: string;
    localidad?: string;
    zona?: string;
    sector?: string;
    manzana?: string;
    casa?: string;
  };
}

export interface SelectOption {
  code: string;
  name: string;
}

export interface NominatimSearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

@Component({
  selector: 'app-geofence-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './geofence-picker.component.html',
  styleUrl: './geofence-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeofencePickerComponent implements AfterViewInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly http = inject(HttpClient);
  readonly gisService = inject(GisService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Inputs
  zoneName = input<string>('');
  targetLat = input<number | null>(null);
  targetLng = input<number | null>(null);
  radiusMeters = input<number>(500);
  disabled = input<boolean>(false);

  // Output
  geofenceChange = output<GeofenceChangeEvent>();

  // Element reference to map container
  mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');

  // Internal Reactive State Signals
  readonly localZoneName = signal<string>('');
  readonly localLat = signal<number | null>(null);
  readonly localLng = signal<number | null>(null);
  readonly localRadius = signal<number>(500);
  readonly currentZoom = signal<number>(14);

  // Cascade Dropdown Lists
  readonly provinciasList = signal<SelectOption[]>([]);
  readonly cantonesList = signal<SelectOption[]>([]);
  readonly parroquiasList = signal<SelectOption[]>([]);
  readonly zonasList = signal<SelectOption[]>([]);
  readonly localidadesList = signal<string[]>([]);
  readonly sectoresList = signal<SelectOption[]>([]);
  readonly manzanasList = signal<SelectOption[]>([]);

  // Selected Codes
  readonly selectedProvincia = signal<string>('');
  readonly selectedCanton = signal<string>('');
  readonly selectedParroquia = signal<string>('');
  readonly selectedZona = signal<string>('');
  readonly selectedLocalidad = signal<string>('');
  readonly selectedSector = signal<string>('');
  readonly selectedManzana = signal<string>('');

  // Computados de Estado de Geocerca (Única Fuente de Verdad)
  readonly isManzanaGeofence = computed(() => !!this.selectedManzana());
  readonly isRuralZone = computed(() => {
    const z = this.selectedZona();
    const p = this.selectedParroquia();
    if (z && (z === '999' || z.endsWith('999'))) return true;
    if (p && p.length >= 6) {
      const parrNum = parseInt(p.substring(4, 6), 10);
      if (!isNaN(parrNum) && parrNum >= 51) return true;
    }
    return false;
  });

  // Banner status text 100% en vivo según DPA oficial 2026 (Estado y Serialización Limpia)
  readonly bannerStatusText = computed(() => {
    if (this.isManzanaGeofence()) {
      const code = this.selectedManzana();
      const parCode = this.selectedParroquia();
      const parName = this.gisService.getParroquiaName(parCode);
      const secCode = this.selectedSector();
      const locName = parName || (secCode ? `Sector ${secCode}` : 'Sector INEC');
      return `📍 Manzana INEC: ${code} | ${locName}`;
    } else {
      const r = this.localRadius();
      const lat = this.localLat() !== null ? this.localLat() : '0';
      const lng = this.localLng() !== null ? this.localLng() : '0';
      const parCode = this.selectedParroquia();
      const parName = this.gisService.getParroquiaName(parCode);
      const cantCode = this.selectedCanton();
      const cantObj = this.allCantones.find((c) => c.code === cantCode);
      const cantName = cantObj ? cantObj.name : cantCode;
      const parStr = parName || 'Parroquia';
      const cantStr = cantName || 'Cantón';
      return `🎯 Cobertura Circular: Radio ${r}m | Centroide: [${lat}, ${lng}] en ${parStr}, ${cantStr}`;
    }
  });

  // DPA Cache
  private allCantones: DpaCanton[] = [];
  private allParroquiasOptions: SelectOption[] = [];

  // Search State
  readonly searchQuery = signal<string>('');
  readonly isSearching = signal<boolean>(false);
  readonly searchResults = signal<NominatimSearchResult[]>([]);
  readonly searchError = signal<string | null>(null);

  // Selected INEC Cartographic Feature State
  readonly selectedInecInfo = signal<GisSelection | null>(null);

  // Leaflet references
  private map: any = null;
  private marker: any = null;
  private circle: any = null;
  private LInstance: typeof import('leaflet') | null = null;

  // INEC Layer Groups for Leaflet
  private parroquiasGroup: any = null;
  private sectoresGroup: any = null;
  private manzanasGroup: any = null;
  private highlightGroup: any = null;

  // Layer Dictionaries by Code
  private parroquiaLayersMap = new Map<string, any>();
  private sectorLayersMap = new Map<string, any>();
  private manzanaLayersMap = new Map<string, any>();

  // Default initial coordinates (ULEAM / Manta - Ecuador)
  private readonly DEFAULT_LAT = -0.95382;
  private readonly DEFAULT_LNG = -80.74561;

  constructor() {
    effect(() => {
      this.localZoneName.set(this.zoneName() || '');
      this.localLat.set(this.targetLat());
      this.localLng.set(this.targetLng());
      this.localRadius.set(this.radiusMeters() || 500);

      if (this.map && this.LInstance) {
        this.updateMapGraphics(false);
      }
    });
  }

  async ngAfterViewInit(): Promise<void> {
    if (!this.isBrowser) return;

    try {
      const L = await import('leaflet');
      this.LInstance = L.default || L;
      this.initMap();
    } catch (err) {
      console.error('Error al cargar Leaflet:', err);
    }
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.off();
      this.map.remove();
      this.map = null;
    }
  }

  private initMap(): void {
    const container = this.mapContainer()?.nativeElement;
    if (!container || !this.LInstance) return;

    const lat = this.localLat() ?? this.DEFAULT_LAT;
    const lng = this.localLng() ?? this.DEFAULT_LNG;
    const zoom = this.localLat() !== null ? 15 : 14;

    this.currentZoom.set(zoom);

    if (this.localLat() === null || this.localLng() === null) {
      this.setPosition(lat, lng, true);
    }

    // 1. Create Map Instance with preferCanvas for speed
    this.map = this.LInstance.map(container, {
      center: [lat, lng],
      zoom: zoom,
      preferCanvas: true,
      zoomControl: true,
    });

    // 2. Add Base Tile Layer
    this.LInstance.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      updateWhenIdle: true,
      updateWhenZooming: false,
      attribution: '&copy; OpenStreetMap contributors | Capas INEC Ecuador',
    }).addTo(this.map);

    // 3. Initialize GIS Layer Groups
    this.parroquiasGroup = this.LInstance.layerGroup().addTo(this.map);
    this.sectoresGroup = this.LInstance.layerGroup().addTo(this.map);
    this.manzanasGroup = this.LInstance.layerGroup().addTo(this.map);
    this.highlightGroup = this.LInstance.layerGroup().addTo(this.map);

    // 4. Add Leaflet Layer Control (L.control.layers)
    const overlayMaps = {
      '🟢 Parroquias INEC': this.parroquiasGroup,
      '🔵 Sectores INEC': this.sectoresGroup,
      '🟠 Manzanas INEC': this.manzanasGroup,
    };
    this.LInstance.control.layers(undefined, overlayMaps, { collapsed: false }).addTo(this.map);

    // 5. Add Custom Pin Icon & Draggable Marker
    const customIcon = this.createCustomIcon();
    this.marker = this.LInstance.marker([lat, lng], {
      draggable: !this.disabled(),
      icon: customIcon,
    }).addTo(this.map);

    // 6. Add Geofence Circle (interactive: false para no bloquear clics en manzanas)
    this.circle = this.LInstance.circle([lat, lng], {
      radius: this.localRadius(),
      color: '#10b981',
      fillColor: '#10b981',
      fillOpacity: 0.15,
      weight: 2,
      interactive: false,
    }).addTo(this.map);

    // 7. Event Listeners
    this.marker.on('dragend', (event: any) => {
      if (this.disabled()) return;
      const position = event.target.getLatLng();
      this.clearManzanaSelection();
      this.setPosition(position.lat, position.lng, true);
    });

    this.map.on('click', (event: any) => {
      if (this.disabled()) return;
      this.clearManzanaSelection();
      this.setPosition(event.latlng.lat, event.latlng.lng, true);
    });

    this.map.on('zoomend', () => {
      if (this.map) {
        this.currentZoom.set(this.map.getZoom());
      }
    });

    // 8. Cargar DPA (Provincias/Cantones/Parroquias Oficiales DPA 2026)
    this.loadInecCartography();

    setTimeout(() => {
      this.map?.invalidateSize();
    }, 250);
  }

  private loadInecCartography(): void {
    // 1. Cargar DPA (Provincias / Cantones / Parroquias Oficiales de 6 dígitos)
    this.gisService.getDpa().subscribe((dpa) => {
      const provOptions = (dpa.provincias || []).map((p) => ({
        code: p.code,
        name: `${p.code} - ${p.name}`,
      }));
      this.provinciasList.set(provOptions);
      this.allCantones = dpa.cantones || [];

      // Garantía DPA 2026: Únicamente parroquias oficiales de 6 dígitos
      this.allParroquiasOptions = (dpa.parroquias || [])
        .map((p) => ({
          code: p.code,
          name: `${p.code} - ${p.name}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      this.parroquiasList.set(this.allParroquiasOptions);
    });

    // 2. Cargar Capa Espacial Parroquias y auto-resolver Parroquia + Manzanas iniciales
    this.gisService.getParroquias().subscribe((fc: any) => {
      this.renderParroquias(fc);
      const lat = this.localLat() ?? this.DEFAULT_LAT;
      const lng = this.localLng() ?? this.DEFAULT_LNG;
      const currentParr = this.selectedParroquia();
      this.resolveParroquiaFromCoordinates(lat, lng, true);

      if (this.manzanaLayersMap.size === 0 && currentParr) {
        const layer = this.parroquiaLayersMap.get(currentParr);
        this.onParroquiaClick(currentParr, layer, false);
      }
    });
  }

  private renderParroquias(fc: any): void {
    if (!this.LInstance || !this.parroquiasGroup) return;
    this.parroquiasGroup.clearLayers();
    this.parroquiaLayersMap.clear();

    const layer = this.LInstance.geoJSON(fc, {
      interactive: false,
      style: {
        color: '#10b981',
        weight: 2.5,
        fillColor: '#10b981',
        fillOpacity: 0.05,
      },
      onEachFeature: (feature: any, l: any) => {
        const props = feature.properties || {};
        const code = (props['cod_parroquia'] || props['parroq'] || '').toString();
        const name = props['nombre'] || `Parroquia ${code}`;

        if (code) {
          this.parroquiaLayersMap.set(code, l);
        }

        l.bindTooltip(`<b>INEC Parroquia:</b> ${name}`, { sticky: true });
      },
    });

    this.parroquiasGroup.addLayer(layer);
  }

  /**
   * Evento 1. Selección de Provincia
   */
  onProvinciaChange(code: string): void {
    this.selectedProvincia.set(code);
    this.selectedCanton.set('');
    this.selectedParroquia.set('');
    this.selectedSector.set('');
    this.selectedManzana.set('');

    this.clearManzanaSelection();
    this.sectoresGroup?.clearLayers();
    this.manzanasGroup?.clearLayers();
    this.sectoresList.set([]);
    this.manzanasList.set([]);

    if (!code) {
      this.cantonesList.set([]);
      this.parroquiasList.set(this.allParroquiasOptions);
      return;
    }

    const filteredCantons = this.allCantones
      .filter((c) => c.provCode === code)
      .map((c) => ({ code: c.code, name: `${c.code} - ${c.name}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
    this.cantonesList.set(filteredCantons);

    const filteredParroquias = this.allParroquiasOptions.filter((p) => p.code.startsWith(code));
    this.parroquiasList.set(filteredParroquias);

    this.fitMapToBoundsForPrefix(code);
  }

  /**
   * Evento 2. Selección de Cantón
   */
  onCantonChange(code: string): void {
    this.selectedCanton.set(code);
    this.selectedParroquia.set('');
    this.selectedSector.set('');
    this.selectedManzana.set('');

    this.clearManzanaSelection();
    this.sectoresGroup?.clearLayers();
    this.manzanasGroup?.clearLayers();
    this.sectoresList.set([]);
    this.manzanasList.set([]);

    if (!code) {
      const provCode = this.selectedProvincia();
      if (provCode) {
        const filteredParroquias = this.allParroquiasOptions.filter((p) => p.code.startsWith(provCode));
        this.parroquiasList.set(filteredParroquias);
      } else {
        this.parroquiasList.set(this.allParroquiasOptions);
      }
      return;
    }

    const filteredParroquias = this.allParroquiasOptions.filter((p) => p.code.startsWith(code));
    this.parroquiasList.set(filteredParroquias);

    this.fitMapToBoundsForPrefix(code);
  }

  /**
   * Evento 3. Selección de Parroquia
   */
  onParroquiaChange(code: string): void {
    if (!code) {
      this.selectedParroquia.set('');
      this.selectedSector.set('');
      this.selectedManzana.set('');
      this.clearManzanaSelection();
      this.sectoresGroup?.clearLayers();
      this.manzanasGroup?.clearLayers();
      this.sectoresList.set([]);
      this.manzanasList.set([]);
      return;
    }

    const layer = this.parroquiaLayersMap.get(code);
    this.onParroquiaClick(code, layer, true);
  }

  private onParroquiaClick(code: string, layer?: any, fitBounds = false): void {
    this.selectedParroquia.set(code);
    this.selectedZona.set('');
    this.selectedLocalidad.set('');
    this.selectedSector.set('');
    this.selectedManzana.set('');

    this.clearManzanaSelection();

    if (code.length >= 4) {
      const provCode = code.substring(0, 2);
      const cantCode = code.substring(0, 4);

      if (this.selectedProvincia() !== provCode) {
        this.selectedProvincia.set(provCode);
        const filteredCantons = this.allCantones
          .filter((c) => c.provCode === provCode)
          .map((c) => ({ code: c.code, name: `${c.code} - ${c.name}` }));
        this.cantonesList.set(filteredCantons);
      }

      if (this.selectedCanton() !== cantCode) {
        this.selectedCanton.set(cantCode);
      }
    }

    if (fitBounds && layer?.getBounds && this.map) {
      this.map.fitBounds(layer.getBounds(), { padding: [20, 20] });
    }

    this.sectoresGroup?.clearLayers();
    this.manzanasGroup?.clearLayers();
    this.zonasList.set([]);
    this.localidadesList.set([]);
    this.sectoresList.set([]);
    this.manzanasList.set([]);

    this.gisService.getZonasByParroquia(code).subscribe((zonas) => {
      this.zonasList.set(zonas);
    });

    this.gisService.getSectoresByParroquia(code).subscribe((fc: any) => {
      const locSet = new Set<string>();
      (fc.features || []).forEach((f: any) => {
        const loc = f.properties?.localidad;
        if (loc && loc.trim()) locSet.add(loc.trim());
      });

      this.localidadesList.set(Array.from(locSet).sort((a, b) => a.localeCompare(b)));
      this.renderSectores(fc);
    });

    // Cargar Manzanas de la Parroquia directamente para interacción Map-First
    this.gisService.getManzanasByParroquia(code).subscribe((fc: any) => {
      this.renderManzanas(fc);
    });
  }

  /**
   * Evento Selección de Zona Censal INEC
   */
  onZonaChange(code: string): void {
    this.selectedZona.set(code);
    this.selectedSector.set('');
    this.selectedManzana.set('');

    this.clearManzanaSelection();
    this.sectoresGroup?.clearLayers();
    this.manzanasGroup?.clearLayers();
    this.sectoresList.set([]);
    this.manzanasList.set([]);

    const parCode = this.selectedParroquia();
    if (parCode) {
      this.gisService.getSectoresByParroquia(parCode).subscribe((fc: any) => {
        this.renderSectores(fc);
      });
    }
  }

  /**
   * Evento Selección de Localidad / Barrio
   */
  onLocalidadChange(localidad: string): void {
    this.selectedLocalidad.set(localidad);
    this.selectedSector.set('');
    this.selectedManzana.set('');
    this.clearManzanaSelection();
    this.sectoresGroup?.clearLayers();
    this.manzanasGroup?.clearLayers();

    const code = this.selectedParroquia();
    if (code) {
      this.gisService.getSectoresByParroquia(code).subscribe((fc: any) => {
        this.renderSectores(fc);
      });
    }
  }

  private renderSectores(fc: any): void {
    if (!this.LInstance || !this.sectoresGroup) return;
    this.sectoresGroup.clearLayers();
    this.sectorLayersMap.clear();

    const options: SelectOption[] = [];
    const filterZona = this.selectedZona();
    const filterLoc = this.selectedLocalidad();

    let filteredFeatures = (fc.features || []).filter((f: any) => {
      const p = f.properties || {};
      if (filterZona) {
        const codZona = (p.cod_zona || p.zona || '').toString();
        const matchesZona = codZona === filterZona || codZona.endsWith(filterZona) || filterZona.endsWith(codZona);
        if (!matchesZona) return false;
      }
      if (filterLoc) {
        const matchesLoc = p.localidad === filterLoc || (p.localidad && p.localidad.includes(filterLoc));
        if (!matchesLoc) return false;
      }
      return true;
    });

    if (filteredFeatures.length === 0 && !filterZona && filterLoc) {
      filteredFeatures = fc.features || [];
    }

    const filteredCollection = { ...fc, features: filteredFeatures };

    const layer = this.LInstance.geoJSON(filteredCollection, {
      interactive: false,
      style: {
        color: '#06b6d4',
        weight: 1.5,
        fillColor: '#06b6d4',
        fillOpacity: 0.05,
      },
      onEachFeature: (feature: any, l: any) => {
        const props = feature.properties || {};
        const code = (props['cod_sector'] || props['sec'] || '').toString();
        const name = props['nombre'] || `Sector ${code}`;

        if (code) {
          options.push({ code, name });
          this.sectorLayersMap.set(code, l);
        }

        l.bindTooltip(`<b>INEC Sector:</b> ${name}`, { sticky: true });
      },
    });

    this.sectoresGroup.addLayer(layer);
    this.sectoresList.set(options.sort((a, b) => a.name.localeCompare(b.name)));
  }

  /**
   * Evento 4. Selección de Sector
   */
  onSectorChange(code: string): void {
    if (!code) {
      this.selectedSector.set('');
      this.selectedManzana.set('');
      this.clearManzanaSelection();
      this.manzanasGroup?.clearLayers();
      this.manzanasList.set([]);
      return;
    }

    const layer = this.sectorLayersMap.get(code);
    this.onSectorClick(code, layer);
  }

  private onSectorClick(code: string, layer?: any): void {
    if (code && code.length === 12) {
      const provCode = code.substring(0, 2);
      const cantCode = code.substring(0, 4);
      const parrCode = code.substring(0, 6);
      const zonaCode = code.substring(0, 9);

      if (this.selectedProvincia() !== provCode) this.selectedProvincia.set(provCode);
      if (this.selectedCanton() !== cantCode) this.selectedCanton.set(cantCode);
      if (this.selectedParroquia() !== parrCode) this.selectedParroquia.set(parrCode);
      if (this.selectedZona() !== zonaCode) this.selectedZona.set(zonaCode);
    }

    this.selectedSector.set(code);
    this.clearManzanaSelection();

    if (layer?.getBounds && this.map) {
      this.map.fitBounds(layer.getBounds(), { padding: [30, 30] });
    }

    this.manzanasGroup?.clearLayers();
    this.manzanasList.set([]);

    this.gisService.getManzanasBySector(code).subscribe((fc: any) => {
      this.renderManzanas(fc);
    });
  }

  private renderManzanas(fc: any): void {
    if (!this.LInstance || !this.manzanasGroup) return;
    this.manzanasGroup.clearLayers();
    this.manzanaLayersMap.clear();

    const options: SelectOption[] = [];

    const layer = this.LInstance.geoJSON(fc, {
      style: {
        color: '#f97316',
        weight: 2,
        fillColor: '#fdba74',
        fillOpacity: 0.2,
      },
      onEachFeature: (feature: any, l: any) => {
        const props = feature.properties || {};
        const code = (props['cod_manzana'] || props['man'] || '').toString();
        const name = props['nombre'] || `Manzana ${code}`;

        if (code) {
          options.push({ code, name });
          this.manzanaLayersMap.set(code, l);
        }

        l.bindTooltip(`<b>INEC Manzana:</b> ${name}<br><small>Cod: ${code}</small>`, { sticky: true });
        l.on('click', (e: any) => {
          if (this.LInstance?.DomEvent) {
            this.LInstance.DomEvent.stopPropagation(e);
            this.LInstance.DomEvent.preventDefault(e);
          }
          if (e.originalEvent) {
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
          }
          this.onManzanaClick(code, feature, l);
        });
      },
    });

    this.manzanasGroup.addLayer(layer);
    if (layer.bringToFront) {
      layer.bringToFront();
    }
    this.manzanasList.set(options.sort((a, b) => a.name.localeCompare(b.name)));
  }

  /**
   * Evento 5. Selección de Manzana (Conmutación a MODO A: MANZANA CENSAL)
   */
  onManzanaChange(code: string): void {
    if (!code) {
      this.clearManzanaSelection();
      return;
    }

    const layer = this.manzanaLayersMap.get(code);
    if (layer && layer.feature) {
      this.onManzanaClick(code, layer.feature, layer);
    }
  }

  private onManzanaClick(code: string, feature: any, layer: any): void {
    if (this.disabled()) return;

    // Si la zona es rural, prohibir manzana y forzar Modo B Circular
    if (this.isRuralZone()) {
      this.clearManzanaSelection();
      return;
    }

    // Sincronización exacta de jerarquía DPA de 15 dígitos
    if (code && code.length === 15) {
      const provCode = code.substring(0, 2);
      const cantCode = code.substring(0, 4);
      const parrCode = code.substring(0, 6);
      const zonaCode = code.substring(0, 9);
      const secCode = code.substring(0, 12);

      if (this.selectedProvincia() !== provCode) this.selectedProvincia.set(provCode);
      if (this.selectedCanton() !== cantCode) this.selectedCanton.set(cantCode);

      // Preservar la parroquia urbana seleccionada actualmente si pertenece al mismo cantón
      const currentParroquia = this.selectedParroquia();
      if (!currentParroquia || !currentParroquia.startsWith(cantCode)) {
        this.selectedParroquia.set(parrCode);
      }

      this.selectedZona.set(zonaCode);
      this.selectedSector.set(secCode);
    }

    this.selectedManzana.set(code);
    this.highlightLayer(layer);

    let centerLat = this.localLat() ?? 0;
    let centerLng = this.localLng() ?? 0;

    if (layer && layer.getBounds) {
      const bounds = layer.getBounds();
      const center = bounds.getCenter();
      centerLat = Number(center.lat.toFixed(6));
      centerLng = Number(center.lng.toFixed(6));
    }

    const props = feature.properties || {};
    const name = props['nombre'] || `Manzana ${code}`;

    const gisSelection: GisSelection = {
      code,
      name,
      level: 'manzana',
      lat: centerLat,
      lng: centerLng,
      radius: 0,
      codProvincia: this.selectedProvincia(),
      codCanton: this.selectedCanton(),
      codParroquia: this.selectedParroquia(),
      codSector: this.selectedSector(),
      codManzana: code,
      geometry: feature?.geometry,
      properties: props,
    };

    this.selectedInecInfo.set(gisSelection);
    this.gisService.setSelection(gisSelection);

    this.localLat.set(centerLat);
    this.localLng.set(centerLng);

    // Garantizar que el círculo quede completamente removido en Modo Manzana
    if (this.circle) {
      this.circle.setRadius(0);
      if (this.map && this.map.hasLayer(this.circle)) {
        this.map.removeLayer(this.circle);
      }
    }
    if (this.marker) {
      this.marker.setLatLng([centerLat, centerLng]);
    }

    this.updateZoneName(name);
    this.emitGeofenceChange();
  }

  private fitMapToBoundsForPrefix(prefixCode: string): void {
    if (!this.LInstance || !this.map) return;
    const matchingLayers: any[] = [];
    this.parroquiaLayersMap.forEach((layer, code) => {
      if (code.startsWith(prefixCode)) {
        matchingLayers.push(layer);
      }
    });

    if (matchingLayers.length > 0) {
      const group = this.LInstance.featureGroup(matchingLayers);
      this.map.fitBounds(group.getBounds(), { padding: [25, 25] });
    }
  }

  private highlightLayer(layer: any): void {
    if (!this.LInstance || !this.highlightGroup) return;

    this.highlightGroup.clearLayers();

    if (layer && layer.toGeoJSON) {
      const highlight = this.LInstance.geoJSON(layer.toGeoJSON(), {
        style: {
          weight: 4,
          color: '#10b981', // Verde esmeralda para el polígono de geocerca activa
          fillColor: '#10b981',
          fillOpacity: 0.35,
        },
      });
      this.highlightGroup.addLayer(highlight);
    }
  }

  private createCustomIcon(): any {
    if (!this.LInstance) return undefined;

    return this.LInstance.divIcon({
      className: 'custom-geofence-pin',
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: #10b981;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(16,185,129,0.4);
          border: 2px solid #ffffff;
        ">
          <div style="
            width: 10px;
            height: 10px;
            background: #ffffff;
            border-radius: 50%;
          "></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });
  }

  /**
   * Resuelve la parroquia automáticamente según coordenadas
   */
  private resolveParroquiaFromCoordinates(lat: number, lng: number, forceLoad = false): void {
    if (!this.parroquiaLayersMap.size || this.selectedManzana()) return;

    const latLng = this.LInstance ? this.LInstance.latLng(lat, lng) : [lat, lng];

    for (const [parrCode, layer] of this.parroquiaLayersMap.entries()) {
      if (layer && layer.getBounds && layer.getBounds().contains(latLng)) {
        if (this.selectedParroquia() !== parrCode || this.manzanaLayersMap.size === 0 || forceLoad) {
          this.onParroquiaClick(parrCode, layer, false);
        }
        break;
      }
    }
  }

  private setPosition(lat: number, lng: number, emitChange = true): void {
    const fixedLat = Number(lat.toFixed(6));
    const fixedLng = Number(lng.toFixed(6));

    this.localLat.set(fixedLat);
    this.localLng.set(fixedLng);

    this.updateMapGraphics(false);

    if (emitChange) {
      this.resolveParroquiaFromCoordinates(fixedLat, fixedLng);
      this.emitGeofenceChange();
    }
  }

  /**
   * Conmuta forzadamente de MODO A (Polígono Manzana) a MODO B (Radio Circular)
   */
  clearManzanaSelection(): void {
    if (this.selectedManzana()) {
      this.selectedManzana.set('');
      this.highlightGroup?.clearLayers();
      if (this.selectedInecInfo()?.level === 'manzana') {
        this.selectedInecInfo.set(null);
      }
      this.updateMapGraphics(false);
      this.emitGeofenceChange();
    }
  }

  updateZoneName(name: string): void {
    this.localZoneName.set(name);
    this.emitGeofenceChange();
  }

  updateRadius(radius: number): void {
    const newRadius = Number(radius) || 500;
    this.localRadius.set(newRadius);

    // Exclusión mutua: Limpiar manzana activa si el usuario modifica el radio
    if (this.selectedManzana()) {
      this.clearManzanaSelection();
    }

    if (this.circle) {
      this.circle.setRadius(newRadius);
    }

    this.emitGeofenceChange();
  }

  useCurrentLocation(): void {
    if (!this.isBrowser || !('geolocation' in navigator)) {
      alert('La geolocalización no está disponible en este navegador.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.clearManzanaSelection();
        this.setPosition(lat, lng, true);
        this.resolveParroquiaFromCoordinates(lat, lng);
        if (this.map) {
          this.map.flyTo([lat, lng], 16);
        }
      },
      (err) => {
        alert('No se pudo obtener la ubicación actual: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  searchLocation(): void {
    const query = this.searchQuery().trim();
    if (!query) {
      this.clearSearch();
      return;
    }

    this.isSearching.set(true);
    this.searchError.set(null);
    this.searchResults.set([]);

    // Contextual geocoding: Añadir contexto del Cantón y Ecuador si no están presentes
    const cantCode = this.selectedCanton();
    const cantObj = this.allCantones.find((c) => c.code === cantCode);
    const cantName = cantObj ? cantObj.name.replace(/^\d+\s*-\s*/, '').trim() : 'Manta';

    let contextualQuery = query;
    if (!/ecuador/i.test(contextualQuery)) {
      if (cantName && !new RegExp(cantName, 'i').test(contextualQuery)) {
        contextualQuery = `${contextualQuery}, ${cantName}, Ecuador`;
      } else {
        contextualQuery = `${contextualQuery}, Ecuador`;
      }
    }

    let url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=ec&limit=5&q=${encodeURIComponent(contextualQuery)}`;

    if (this.map) {
      const bounds = this.map.getBounds();
      const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
      url += `&viewbox=${encodeURIComponent(viewbox)}&bounded=0`;
    }

    this.http.get<NominatimSearchResult[]>(url).subscribe({
      next: (results) => {
        this.isSearching.set(false);
        if (results && results.length > 0) {
          this.searchResults.set(results);
        } else {
          this.searchError.set('No se encontraron lugares o direcciones coincidentes.');
        }
      },
      error: () => {
        this.isSearching.set(false);
        this.searchError.set('Ocurrió un error al consultar el servicio de búsqueda.');
      },
    });
  }

  selectSearchResult(result: NominatimSearchResult): void {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    if (isNaN(lat) || isNaN(lng)) return;

    this.searchResults.set([]);
    this.searchQuery.set(result.display_name.split(',')[0]);

    this.clearManzanaSelection();
    this.setPosition(lat, lng, true);

    const isRural = this.isRuralZone();
    const targetZoom = isRural ? 15 : 17;

    if (this.map) {
      this.map.flyTo([lat, lng], targetZoom);
    }

    // Si es zona urbana (zoom 17), asegurar precarga y visibilidad de manzanas en el lienzo
    if (!isRural) {
      const parCode = this.selectedParroquia();
      if (parCode) {
        this.gisService.getManzanasByParroquia(parCode).subscribe((fc: any) => {
          this.renderManzanas(fc);
        });
      }
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searchError.set(null);
  }

  private updateMapGraphics(recenter = false): void {
    const lat = this.localLat();
    const lng = this.localLng();
    const radius = this.localRadius();

    if (lat === null || lng === null || !this.map) return;

    const latLng = [lat, lng] as [number, number];

    if (this.marker) {
      this.marker.setLatLng(latLng);
    }

    if (this.circle) {
      if (this.selectedManzana()) {
        // En Modo Manzana: Desactivar radio y remover el círculo del mapa
        this.circle.setRadius(0);
        if (this.map.hasLayer(this.circle)) {
          this.map.removeLayer(this.circle);
        }
      } else {
        // En Modo Circular: Asegurar que el círculo esté en el mapa con su radio correspondiente
        if (!this.map.hasLayer(this.circle)) {
          this.map.addLayer(this.circle);
        }
        this.circle.setLatLng(latLng);
        this.circle.setRadius(radius);
      }
    }

    if (recenter && this.map) {
      this.map.panTo(latLng);
    }
  }

  private emitGeofenceChange(): void {
    const name = this.localZoneName();
    const lat = this.localLat();
    const lng = this.localLng();
    const radius = this.localRadius();
    const inec = this.selectedInecInfo();
    const isManzanaGeofence = !!this.selectedManzana();

    this.geofenceChange.emit({
      zone_name: name,
      target_lat: lat,
      target_lng: lng,
      radius_meters: isManzanaGeofence ? 0 : radius,
      geofencing: {
        name,
        lat,
        lng,
        radius: isManzanaGeofence ? 0 : radius,
        geofence_type: isManzanaGeofence ? 'manzana_polygon' : 'circular_radius',
        polygon_geometry: isManzanaGeofence ? inec?.geometry : undefined,
      },
      inec_hierarchy: {
        provincia: this.selectedProvincia() || undefined,
        canton: this.selectedCanton() || undefined,
        parroquia: this.selectedParroquia() || undefined,
        zona: this.selectedZona() || undefined,
        localidad: this.selectedLocalidad() || undefined,
        sector: this.selectedSector() || undefined,
        manzana: isManzanaGeofence ? this.selectedManzana() : undefined,
        casa: isManzanaGeofence ? inec?.properties?.['cod_casa'] : undefined,
      },
    });
  }
}

