import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin } from 'rxjs';
import { map, tap, shareReplay, catchError, switchMap } from 'rxjs/operators';

export interface LocalidadesData {
  code12: Record<string, string>;
  code9: Record<string, string>;
  parr_to_locs: Record<string, string[]>;
}

export interface GisFeatureProperties {
  cod_parroquia?: string;
  cod_zona?: string;
  cod_sector?: string;
  cod_manzana?: string;
  nombre?: string;
  localidad?: string;
  [key: string]: any;
}

export interface GisFeature {
  type: 'Feature';
  properties: GisFeatureProperties;
  geometry: {
    type: string;
    coordinates: any;
  };
}

export interface GisFeatureCollection {
  type: 'FeatureCollection';
  features: GisFeature[];
}

export interface DpaProvincia {
  code: string;
  name: string;
}

export interface DpaCanton {
  code: string;
  provCode: string;
  name: string;
}

export interface DpaParroquia {
  code: string;
  cantonCode: string;
  provCode: string;
  name: string;
  isRural: boolean;
}

export interface DpaData {
  provincias: DpaProvincia[];
  cantones: DpaCanton[];
  parroquias: DpaParroquia[];
}

export interface GisSelection {
  code: string;
  name: string;
  level: 'provincia' | 'canton' | 'parroquia' | 'sector' | 'manzana';
  lat: number;
  lng: number;
  radius: number;
  codProvincia?: string;
  codCanton?: string;
  codParroquia?: string;
  codSector?: string;
  codManzana?: string;
  geometry?: any;
  properties: Record<string, any>;
}

export function formatSectorName(
  secCode: string,
  originalName?: string,
  parroquiaName?: string
): string {
  const code = (secCode || '').toString().trim();
  if (!code) return 'Sector Desconocido';

  // Si tiene 12 dígitos estándar INEC, formatear siempre como: Sector X (Zona Y, PARROQUIA)
  if (code.length === 12 && /^\d+$/.test(code)) {
    const zonaNum = parseInt(code.substring(6, 9), 10);
    const sectorNum = parseInt(code.substring(9, 12), 10);
    const parStr = parroquiaName ? `, ${parroquiaName}` : '';
    return `Sector ${sectorNum} (Zona ${zonaNum}${parStr})`;
  }

  if (
    originalName &&
    originalName !== code &&
    !originalName.startsWith(`Sector ${code}`) &&
    !/^\d+$/.test(originalName.replace('Sector ', '').trim())
  ) {
    return originalName;
  }

  return originalName || `Sector ${code}`;
}

export function formatManzanaName(
  manCode: string,
  originalName?: string,
  parroquiaName?: string
): string {
  const code = (manCode || '').toString().trim();
  if (!code) return 'Manzana Desconocida';

  // Si tiene 15 dígitos estándar INEC, formatear siempre como: Manzana X - Sector Y (Zona Z, PARROQUIA)
  if (code.length === 15 && /^\d+$/.test(code)) {
    const zonaNum = parseInt(code.substring(6, 9), 10);
    const sectorNum = parseInt(code.substring(9, 12), 10);
    const manzanaNum = parseInt(code.substring(12, 15), 10);
    const parStr = parroquiaName ? `, ${parroquiaName}` : '';
    return `Manzana ${manzanaNum} - Sector ${sectorNum} (Zona ${zonaNum}${parStr})`;
  }

  if (
    originalName &&
    originalName !== code &&
    !originalName.startsWith(`Manzana ${code}`) &&
    !/^\d+$/.test(originalName.replace('Manzana ', '').trim())
  ) {
    return originalName;
  }

  return originalName || `Manzana ${code}`;
}

@Injectable({
  providedIn: 'root',
})
export class GisService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'assets/gis';

  // Cache en memoria (Singleton) para no repetir llamadas HTTP
  private readonly cache = new Map<string, any>();
  private readonly maxCachedLayers = 8;
  private readonly parroquiaMap = new Map<string, string>();

  // Estado Reactivo con Signals de Angular 21
  readonly loading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);

  private remember(key: string, value: unknown): void {
    this.cache.delete(key);
    this.cache.set(key, value);
    while (this.cache.size > this.maxCachedLayers) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private reportLoadError(layer: string): void {
    this.loadError.set(`No se pudo cargar la cartografía de ${layer}. Revise la conexión o los archivos GIS publicados.`);
    this.loading.set(false);
  }

  // Jerarquía seleccionada en cascada
  readonly selectedProvinciaCode = signal<string | null>(null);
  readonly selectedCantonCode = signal<string | null>(null);
  readonly selectedParroquiaCode = signal<string | null>(null);
  readonly selectedSectorCode = signal<string | null>(null);
  readonly selectedManzanaCode = signal<string | null>(null);
  readonly currentSelection = signal<GisSelection | null>(null);

  // Computados para listas de opciones en la UI
  readonly loadedLayers = computed(() => Array.from(this.cache.keys()));

  /**
   * Obtiene la lista de Zonas Censales INEC asociadas a una Parroquia
   */
  getZonasByParroquia(codParroquia: string): Observable<{ code: string; name: string }[]> {
    if (!codParroquia) return of([]);
    return this.getSectoresByParroquia(codParroquia).pipe(
      map((fc) => {
        const zonaMap = new Map<string, string>();
        (fc.features || []).forEach((f: any) => {
          const p = f.properties || {};
          const sec = (p['cod_sector'] || p['sec'] || '').toString().trim();
          if (sec.length >= 9 && /^\d+$/.test(sec.substring(0, 9))) {
            const zCode = sec.substring(0, 9);
            const zNum = parseInt(sec.substring(6, 9), 10);
            const label = zNum === 999 ? `Zona 999 (Sector Rural)` : `Zona ${zNum}`;
            if (!zonaMap.has(zCode)) {
              zonaMap.set(zCode, label);
            }
          }
        });
        const options = Array.from(zonaMap.entries()).map(([code, name]) => ({
          code,
          name,
        }));
        return options.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      })
    );
  }

  /**
   * Carga la estructura DPA oficial de Ecuador (Provincias, Cantones y Parroquias DPA 2026)
   */
  getDpa(): Observable<DpaData> {
    const cacheKey = 'dpa';
    if (this.cache.has(cacheKey)) {
      return of(this.cache.get(cacheKey) as DpaData);
    }

    this.loadError.set(null);
    return this.http.get<DpaData>(`${this.baseUrl}/dpa.json`).pipe(
      tap((data) => {
        if (data && data.parroquias) {
          data.parroquias.forEach((p) => {
            if (p.code && p.name) {
              // Nombre oficial del clasificador DPA 2026 (ej: 130850 -> MANTA)
              this.parroquiaMap.set(p.code, p.name);
            }
          });
        }
        this.remember(cacheKey, data);
      }),
      shareReplay(1),
      catchError((err) => {
        console.error('[GisService] Error al cargar dpa.json:', err);
        this.reportLoadError('DPA');
        return of({ provincias: [], cantones: [], parroquias: [] });
      })
    );
  }

  /**
   * Carga diferida de capa GeoJSON con cacheo en memoria Singleton
   */
  getLayer(layerName: 'parroquias' | 'sectores' | 'manzanas'): Observable<GisFeatureCollection> {
    if (this.cache.has(layerName)) {
      return of(this.cache.get(layerName)!);
    }

    this.loadError.set(null);
    this.loading.set(true);
    return this.http.get<GisFeatureCollection>(`${this.baseUrl}/${layerName}.geojson`).pipe(
      tap((data) => {
        this.remember(layerName, data);
        this.loading.set(false);
      }),
      shareReplay(1),
      catchError((err) => {
        console.error(`[GisService] Error al cargar la capa '${layerName}':`, err);
        this.reportLoadError(layerName);
        const emptyCollection: GisFeatureCollection = { type: 'FeatureCollection', features: [] };
        return of(emptyCollection);
      })
    );
  }

  /**
   * 1. Obtiene todas las Parroquias (Capa Base Inicial) sin corromper el mapa DPA oficial
   */
  getParroquias(): Observable<GisFeatureCollection> {
    const cacheKey = 'parroquias';
    if (this.cache.has(cacheKey)) {
      return of(this.cache.get(cacheKey)!);
    }

    this.loadError.set(null);
    this.loading.set(true);
    return this.http.get<GisFeatureCollection>(`${this.baseUrl}/parroquias.geojson`).pipe(
      tap((data) => {
        if (data && data.features) {
          data.features.forEach((f) => {
            const p = f.properties || {};
            const code = (p['cod_parroquia'] || p['parroquia'] || p['parroq'] || '').toString().trim();
            const name = (p['nombre'] || p['dpa_despar'] || '').toString().trim();
            // NUNCA sobrescribir el mapa oficial DPA si la parroquia ya fue cargada desde dpa.json
            if (code && name && !this.parroquiaMap.has(code)) {
              this.parroquiaMap.set(code, name);
            }
          });
        }
        this.remember(cacheKey, data);
        this.loading.set(false);
      }),
      shareReplay(1),
      catchError((err) => {
        console.error(`[GisService] Error al cargar parroquias:`, err);
        this.reportLoadError('parroquias');
        const empty: GisFeatureCollection = { type: 'FeatureCollection', features: [] };
        return of(empty);
      })
    );
  }

  getParroquiaName(code: string): string {
    if (!code) return '';
    return this.parroquiaMap.get(code.trim()) || '';
  }

  /**
   * 2. Obtiene los Sectores de la parroquia indicada (asegurando precarga de DPA oficial)
   */
  getSectoresByParroquia(codParroquia: string): Observable<GisFeatureCollection> {
    const empty: GisFeatureCollection = { type: 'FeatureCollection', features: [] };
    if (!codParroquia) return of(empty);
    const code = codParroquia.trim();
    const cacheKey = `sectores_${code}`;

    if (this.cache.has(cacheKey)) {
      return of(this.cache.get(cacheKey)!);
    }

    this.loadError.set(null);
    this.loading.set(true);
    // Garantizar que DPA oficial 2026 esté cargado para resolver nombres oficiales
    return this.getDpa().pipe(
      switchMap(() => this.http.get<GisFeatureCollection>(`${this.baseUrl}/sectores/${code}.json`)),
      map((fc): GisFeatureCollection => {
        const parroquiaName = this.parroquiaMap.get(code) || '';
        const features = (fc.features || []).map((f: any) => {
          const p = f.properties || {};
          const sec = (p['cod_sector'] || p['sec'] || '').toString().trim();
          const par = (p['cod_parroquia'] || p['parroquia'] || code).toString().trim();
          const currentParName = parroquiaName || this.parroquiaMap.get(par) || '';
          const name = formatSectorName(sec, p['nombre'], currentParName);
          const zonaCode = sec.length >= 9 ? sec.substring(0, 9) : '';
          return {
            ...f,
            properties: {
              ...p,
              cod_parroquia: par,
              parroquia: par,
              cod_zona: zonaCode,
              cod_sector: sec,
              sec: sec,
              nombre: name,
            },
          };
        });
        return { type: 'FeatureCollection', features };
      }),
      tap((data) => {
        this.remember(cacheKey, data);
        this.loading.set(false);
      }),
      shareReplay(1),
      catchError((err) => {
        console.warn(`[GisService] No se encontraron sectores para la parroquia '${code}':`, err);
        this.reportLoadError(`sectores (${code})`);
        return of(empty);
      })
    );
  }

  /**
   * Obtiene todas las Manzanas de una Parroquia
   */
  getManzanasByParroquia(codParroquia: string): Observable<GisFeatureCollection> {
    const empty: GisFeatureCollection = { type: 'FeatureCollection', features: [] };
    if (!codParroquia) return of(empty);
    const code = codParroquia.trim();
    const cacheKey = `manzanas_parroquia_${code}`;

    if (this.cache.has(cacheKey)) {
      return of(this.cache.get(cacheKey)!);
    }

    this.loadError.set(null);
    this.loading.set(true);
    const cantonHeader = code.length >= 4 ? `${code.substring(0, 4)}50` : code;

    return this.getDpa().pipe(
      switchMap(() =>
        this.http.get<GisFeatureCollection>(`${this.baseUrl}/manzanas/${code}.json`).pipe(
          catchError(() => {
            if (cantonHeader !== code) {
              return this.http.get<GisFeatureCollection>(`${this.baseUrl}/manzanas/${cantonHeader}.json`);
            }
            this.reportLoadError(`manzanas (${code})`);
            return of(empty);
          })
        )
      ),
      map((fc): GisFeatureCollection => {
        this.loading.set(false);
        const parroquiaName = this.parroquiaMap.get(code) || '';
        const features = (fc.features || []).map((f: any) => {
          const p = f.properties || {};
          const man = (p['cod_manzana'] || p['man'] || '').toString().trim();
          const sec = (p['cod_sector'] || p['sec'] || (man.length >= 12 ? man.substring(0, 12) : '')).toString().trim();
          const currentParName = parroquiaName || this.parroquiaMap.get(code) || '';
          const name = formatManzanaName(man, p['nombre'], currentParName);
          const zonaCode = sec.length >= 9 ? sec.substring(0, 9) : '';
          return {
            ...f,
            properties: {
              ...p,
              cod_parroquia: code,
              cod_zona: zonaCode,
              cod_sector: sec,
              cod_manzana: man,
              man: man,
              nombre: name,
            },
          };
        });
        return { type: 'FeatureCollection', features };
      }),
      tap((data) => {
        this.remember(cacheKey, data);
      }),
      shareReplay(1),
      catchError((err) => {
        console.warn(`[GisService] No se encontraron manzanas para la parroquia '${code}':`, err);
        this.reportLoadError(`manzanas (${code})`);
        return of(empty);
      })
    );
  }

  /**
   * 3. Obtiene las Manzanas del sector indicado
   */
  getManzanasBySector(codSector: string): Observable<GisFeatureCollection> {
    const empty: GisFeatureCollection = { type: 'FeatureCollection', features: [] };
    if (!codSector) return of(empty);
    const secCode = codSector.trim();
    const parrCode = secCode.length >= 6 ? secCode.substring(0, 6) : secCode;
    const cacheKey = `manzanas_sector_${secCode}`;

    if (this.cache.has(cacheKey)) {
      return of(this.cache.get(cacheKey)!);
    }

    this.loadError.set(null);
    this.loading.set(true);
    const load$ = this.cache.has(`manzanas_parroquia_${parrCode}`)
      ? of(this.cache.get(`manzanas_parroquia_${parrCode}`)!)
      : this.getDpa().pipe(
          switchMap(() => this.http.get<GisFeatureCollection>(`${this.baseUrl}/manzanas/${parrCode}.json`)),
          tap((data) => this.remember(`manzanas_parroquia_${parrCode}`, data)),
          catchError(() => {
            this.reportLoadError(`manzanas (${parrCode})`);
            return of(empty);
          })
        );

    return load$.pipe(
      map((fc): GisFeatureCollection => {
        this.loading.set(false);
        const parroquiaName = this.parroquiaMap.get(parrCode) || '';
        const filtered = (fc.features || [])
          .filter((f: any) => {
            const p = f.properties || {};
            const sec = (p['cod_sector'] || p['sec'] || '').toString().trim();
            const man = (p['cod_manzana'] || p['man'] || '').toString().trim();
            return sec === secCode || man.startsWith(secCode);
          })
          .map((f: any) => {
            const p = f.properties || {};
            const man = (p['cod_manzana'] || p['man'] || '').toString().trim();
            const sec = (p['cod_sector'] || p['sec'] || secCode).toString().trim();
            const currentParName = parroquiaName || this.parroquiaMap.get(parrCode) || '';
            const name = formatManzanaName(man, p['nombre'], currentParName);
            const zonaCode = sec.length >= 9 ? sec.substring(0, 9) : '';
            return {
              ...f,
              properties: {
                ...p,
                cod_parroquia: parrCode,
                cod_zona: zonaCode,
                cod_sector: secCode,
                cod_manzana: man,
                man: man,
                nombre: name,
              },
            };
          });

        return { type: 'FeatureCollection', features: filtered };
      }),
      tap((data) => {
        this.remember(cacheKey, data);
      }),
      shareReplay(1)
    );
  }

  /**
   * Actualiza Provincia
   */
  selectProvincia(codProvincia: string | null): void {
    this.selectedProvinciaCode.set(codProvincia);
    this.selectedCantonCode.set(null);
    this.selectedParroquiaCode.set(null);
    this.selectedSectorCode.set(null);
    this.selectedManzanaCode.set(null);
  }

  /**
   * Actualiza Cantón
   */
  selectCanton(codCanton: string | null): void {
    this.selectedCantonCode.set(codCanton);
    this.selectedParroquiaCode.set(null);
    this.selectedSectorCode.set(null);
    this.selectedManzanaCode.set(null);
  }

  /**
   * Actualiza el código de la Parroquia activa y reinicia los niveles inferiores
   */
  selectParroquia(codParroquia: string | null): void {
    this.selectedParroquiaCode.set(codParroquia);
    this.selectedSectorCode.set(null);
    this.selectedManzanaCode.set(null);
  }

  /**
   * Actualiza el código del Sector activo y reinicia manzanas
   */
  selectSector(codSector: string | null): void {
    this.selectedSectorCode.set(codSector);
    this.selectedManzanaCode.set(null);
  }

  /**
   * Actualiza la Manzana seleccionada final
   */
  selectManzana(codManzana: string | null): void {
    this.selectedManzanaCode.set(codManzana);
  }

  /**
   * Registra la selección cartográfica completa
   */
  setSelection(selection: GisSelection | null): void {
    this.currentSelection.set(selection);
  }

  /**
   * Limpia la memoria caché del servicio
   */
  clearCache(): void {
    this.cache.clear();
    this.selectedProvinciaCode.set(null);
    this.selectedCantonCode.set(null);
    this.selectedParroquiaCode.set(null);
    this.selectedSectorCode.set(null);
    this.selectedManzanaCode.set(null);
    this.currentSelection.set(null);
  }
}
