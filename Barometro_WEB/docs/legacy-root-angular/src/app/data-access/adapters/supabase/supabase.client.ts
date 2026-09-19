import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  private initialized = false;

  initialize(url: string, anonKey: string): void {
    if (!url || !anonKey) {
      throw new Error('Supabase URL y anon key son requeridos para inicializar el cliente.');
    }

    // Punto de extension para integrar @supabase/supabase-js en fase futura.
    this.initialized = true;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}
