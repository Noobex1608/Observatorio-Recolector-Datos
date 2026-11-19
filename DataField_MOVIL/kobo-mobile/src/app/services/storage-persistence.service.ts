import { Injectable, signal } from '@angular/core';

/** 'persistent': el navegador no borra los datos; 'best-effort': puede borrarlos si falta espacio o por inactividad. */
export type StorageState = 'persistent' | 'best-effort' | 'unsupported';

/**
 * Pide al navegador que no borre los datos de la app (borradores y respuestas pendientes con sus fotos
 * y videos en IndexedDB). Sin esto, el navegador puede borrarlos si falta espacio, y Safari en iPhone
 * los borra si la app no se abre en unos 7 días.
 */
@Injectable({ providedIn: 'root' })
export class StoragePersistenceService {
  readonly state = signal<StorageState>('best-effort');

  private get api(): StorageManager | undefined {
    return typeof navigator !== 'undefined' ? navigator.storage : undefined;
  }

  /** Estado actual sin pedir nada. */
  async refresh(): Promise<StorageState> {
    const storage = this.api;
    if (!storage?.persisted) {
      this.state.set('unsupported');
      return 'unsupported';
    }
    try {
      const persisted = await storage.persisted();
      this.state.set(persisted ? 'persistent' : 'best-effort');
    } catch {
      this.state.set('best-effort');
    }
    return this.state();
  }

  /**
   * Pide el almacenamiento persistente. Algunos navegadores solo lo conceden si la app está instalada
   * o se usa con frecuencia; por eso se vuelve a pedir al guardar encuestas. Nunca lanza error.
   */
  async request(): Promise<StorageState> {
    const storage = this.api;
    if (!storage?.persist) return this.refresh();
    try {
      if (await storage.persisted()) {
        this.state.set('persistent');
        return 'persistent';
      }
      const granted = await storage.persist();
      this.state.set(granted ? 'persistent' : 'best-effort');
    } catch {
      this.state.set('best-effort');
    }
    return this.state();
  }
}
