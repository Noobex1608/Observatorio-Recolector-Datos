import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

/** Cada cuánto se busca una versión nueva mientras la app sigue abierta. */
const INTERVALO_REVISION_MS = 30 * 60 * 1000;

/**
 * Avisa cuando hay una versión nueva de la PWA ya descargada.
 * Sin esto, el service worker baja la versión nueva pero el teléfono sigue usando la anterior
 * hasta que la app se cierra del todo (una PWA instalada casi nunca se recarga sola).
 * No recarga por su cuenta: la persona elige cuándo, para no cortar una encuesta a medias.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly sw = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);

  /** Hay una versión nueva lista para usarse al recargar. */
  readonly disponible = signal(false);
  readonly actualizando = signal(false);

  iniciar(): void {
    if (!this.sw.isEnabled) return;

    this.sw.versionUpdates
      .pipe(filter((evento): evento is VersionReadyEvent => evento.type === 'VERSION_READY'))
      .subscribe(() => this.disponible.set(true));

    // La caché quedó inservible (p. ej. el navegador borró archivos): solo recargar la arregla.
    this.sw.unrecoverable.subscribe(() => this.document.location.reload());

    this.revisar();
    setInterval(() => this.revisar(), INTERVALO_REVISION_MS);
    // Al volver a la app (desde otra app o con la pantalla apagada) también se revisa.
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible') this.revisar();
    });
  }

  async actualizar(): Promise<void> {
    if (this.actualizando()) return;
    this.actualizando.set(true);
    try {
      await this.sw.activateUpdate();
    } finally {
      this.document.location.reload();
    }
  }

  private revisar(): void {
    if (!navigator.onLine) return;
    this.sw.checkForUpdate().catch(() => {
      // Sin conexión o servidor caído: se vuelve a intentar en la próxima revisión.
    });
  }
}
