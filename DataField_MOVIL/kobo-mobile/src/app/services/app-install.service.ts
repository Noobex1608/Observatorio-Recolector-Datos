import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/** Evento de Chrome/Edge/Samsung Internet para instalar la PWA (no está en los tipos de TypeScript). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Tras «Ahora no» el aviso vuelve a salir pasada una semana. */
const CLAVE_POSPUESTO = 'pwa-install-pospuesto';
const DIAS_POSPUESTO = 7;

/**
 * Ofrece instalar la PWA mientras se usa desde el navegador.
 * - Android / Chrome / Edge: guarda el evento `beforeinstallprompt` y lo lanza con el botón «Instalar».
 * - iPhone / iPad (Safari): no hay evento; se explica cómo añadirla desde «Compartir».
 * Ya instalada (abierta como app, o tras el evento `appinstalled`) el aviso no aparece.
 */
@Injectable({ providedIn: 'root' })
export class AppInstallService {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private evento: BeforeInstallPromptEvent | null = null;

  private readonly instalable = signal(false);
  private readonly instalada = signal(false);
  private readonly pospuesto = signal(false);
  /** Safari en iPhone/iPad: solo se puede instalar a mano. */
  readonly esIos = signal(false);

  readonly mostrar = computed(
    () => !this.instalada() && !this.pospuesto() && (this.instalable() || this.esIos()),
  );

  iniciar(): void {
    const win = this.window;
    if (!win) return;

    if (this.abiertaComoApp(win)) {
      this.instalada.set(true);
      return;
    }
    this.pospuesto.set(this.siguePospuesto());
    this.esIos.set(this.esSafariIos(win));

    win.addEventListener('beforeinstallprompt', (e: Event) => {
      // Sin preventDefault Chrome muestra su propia barra; así se usa el botón de la app.
      e.preventDefault();
      this.evento = e as BeforeInstallPromptEvent;
      this.instalable.set(true);
    });
    win.addEventListener('appinstalled', () => {
      this.evento = null;
      this.instalable.set(false);
      this.instalada.set(true);
    });
  }

  async instalar(): Promise<void> {
    const evento = this.evento;
    if (!evento) return;
    // El evento solo sirve una vez: si la persona cancela, Chrome lo vuelve a enviar más adelante.
    this.evento = null;
    this.instalable.set(false);
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === 'accepted') this.instalada.set(true);
  }

  posponer(): void {
    this.pospuesto.set(true);
    try {
      localStorage.setItem(CLAVE_POSPUESTO, String(Date.now()));
    } catch {
      // Sin almacenamiento (modo privado): se oculta solo en esta visita.
    }
  }

  private abiertaComoApp(win: Window): boolean {
    const standaloneIos = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const modo = typeof win.matchMedia === 'function'
      && ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']
        .some((m) => win.matchMedia(`(display-mode: ${m})`).matches);
    return standaloneIos || modo;
  }

  private siguePospuesto(): boolean {
    try {
      const desde = Number(localStorage.getItem(CLAVE_POSPUESTO));
      return desde > 0 && Date.now() - desde < DIAS_POSPUESTO * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  }

  private esSafariIos(win: Window): boolean {
    const nav = win.navigator;
    const ios = /iPad|iPhone|iPod/.test(nav.userAgent)
      // iPadOS se presenta como Mac, pero con pantalla táctil.
      || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
    // Chrome, Firefox y Edge en iOS no tienen «Agregar a inicio» en el mismo lugar.
    return ios && !/CriOS|FxiOS|EdgiOS/.test(nav.userAgent);
  }
}
