import { Injectable, inject } from '@angular/core';
import { DbService, SavedResponse } from './db.service';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private db = inject(DbService);

  async obtenerCantidad(): Promise<number> {
    return this.db.responses
      .where('estado')
      .equals('listo-para-enviar')
      .count();
  }

  async obtenerFormularios(): Promise<SavedResponse[]> {
    return this.db.responses.toArray();
  }

  async agregarFormulario(formulario: SavedResponse): Promise<number> {
    return this.db.responses.add(formulario);
  }

  async limpiarFormularios(): Promise<void> {
    await this.db.responses.clear();
  }

  async eliminarFormularios(ids: number[]): Promise<void> {
    await this.db.responses.bulkDelete(ids);
  }

  async eliminarFormulario(id: number): Promise<void> {
    await this.db.responses.delete(id);
  }
}
