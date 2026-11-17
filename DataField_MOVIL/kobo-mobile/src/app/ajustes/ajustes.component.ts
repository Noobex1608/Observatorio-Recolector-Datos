import { AfterViewInit, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Location } from '@angular/common';
import { AuthService } from '../auth.service';
import { StorageService } from '../storage.service';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast.service';
import { ApiService } from '../api.service';
import { DbService } from '../db.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { APP_INFO } from '../app-info';
import { TranslatePipe } from '../translate.pipe';

const ROLES: Record<string, string> = {
  SUPER_ADMIN: 'Super administrador', ADMIN: 'Administrador', PROJECT: 'Líder de proyecto',
  SUPERVISOR: 'Supervisor', RECOLECTOR: 'Recolector',
};

@Component({
  selector: 'app-ajustes',
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './ajustes.component.html',
  styleUrls: ['./ajustes.component.css']
})
export class AjustesComponent implements OnInit, AfterViewInit {
  private location = inject(Location);
  private auth = inject(AuthService);
  private storage = inject(StorageService);
  private toast = inject(ToastService);
  private api = inject(ApiService);
  private db = inject(DbService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  theme = inject(ThemeService);

  readonly info = APP_INFO;
  /** Respuestas sin enviar (borradores y listas para enviar) que se perderían al borrar los datos. */
  readonly pendientes = signal(0);
  readonly nombre = this.auth.esModoDemo() ? this.theme.t('demo_mode') : (this.auth.obtenerUsuario() || '—');
  readonly inicial = this.nombre.trim().charAt(0).toUpperCase() || '?';
  readonly email = this.auth.esModoDemo() ? '' : (this.auth.obtenerEmail() || '');
  readonly rol = this.auth.esModoDemo() ? '' : (ROLES[this.auth.obtenerRol() ?? ''] ?? '');
  readonly servidor = this.hostDelServidor();

  async ngOnInit(): Promise<void> {
    await this.contarPendientes();
  }

  /** Al llegar desde "Acerca de" (inicio), se lleva la vista y el foco a esa sección. */
  ngAfterViewInit(): void {
    if (this.route.snapshot.fragment !== 'acerca-de') return;
    setTimeout(() => {
      const seccion = document.getElementById('acerca-de');
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      seccion?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      seccion?.focus({ preventScroll: true });
    });
  }

  avisoPendientes(): string {
    return this.theme.t('delete_pending_warning').replace('{n}', String(this.pendientes()));
  }

  private async contarPendientes(): Promise<void> {
    try {
      this.pendientes.set(await this.db.responses.where('estado').anyOf('borrador', 'listo-para-enviar').count());
    } catch {
      this.pendientes.set(0);
    }
  }

  private hostDelServidor(): string {
    const url = this.auth.obtenerUrlServidor();
    if (!url || this.auth.esModoDemo()) return '';
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  regresarAtras() {
    this.location.back();
  }

  async cambiarServidor() {
    const nuevoServidor = await this.toast.prompt({
      title: this.theme.t('change_server'),
      message: 'Escriba la dirección HTTPS del servidor, sin ruta ni parámetros.',
      label: 'Dirección del servidor',
      value: this.auth.obtenerUrlServidor() || '',
      type: 'url',
      confirmText: 'Continuar',
    });
    if (!nuevoServidor?.trim()) return;
    let target: URL;
    try {
      target = new URL(nuevoServidor.trim());
      const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (target.protocol !== 'https:' && !(localDevelopment && target.protocol === 'http:')) throw new Error();
      if (target.pathname !== '/' || target.search || target.hash) throw new Error();
    } catch {
      this.toast.show('Ingrese el origen HTTPS del backend, sin ruta ni parámetros.', 'error');
      return;
    }
    const current = this.auth.obtenerUrlServidor();
    try {
      if (current && new URL(current).origin === target.origin) return;
    } catch { /* El modo demo no tiene origen HTTP. */ }
    const unsent = await this.db.responses.where('estado').anyOf('borrador', 'listo-para-enviar').count();
    if (unsent > 0) {
      this.toast.show(`Hay ${unsent} respuestas pendientes. Sincronícelas antes de cambiar el servidor.`, 'warning');
      return;
    }
    const accepted = await this.toast.confirm({
      title: 'Cambiar de servidor',
      message: 'Se cerrará la sesión y se borrarán del dispositivo las encuestas y respuestas ya enviadas del servidor anterior.',
      confirmText: 'Cambiar servidor',
      tone: 'danger',
    });
    if (!accepted) return;
    if (current && this.auth.obtenerToken() && !this.auth.esModoDemo() && navigator.onLine) {
      try { await this.api.logout(current); } catch { /* La sesión local se revoca aunque falle la red. */ }
    }
    this.auth.logout();
    await this.db.transaction('rw', this.db.forms, this.db.formList, this.db.responses, this.db.mediaBlobs, async () => {
      await Promise.all([this.db.forms.clear(), this.db.formList.clear(), this.db.responses.clear(), this.db.mediaBlobs.clear()]);
    });
    localStorage.setItem('kobo_server_url', target.origin);
    this.toast.show('Servidor actualizado. Inicie sesión de nuevo.');
    await this.router.navigate(['/login']);
  }

  async limpiarDatos() {
    await this.contarPendientes();
    const pendientes = this.pendientes();
    const accepted = await this.toast.confirm({
      title: this.theme.t('delete_local_responses'),
      // Ningún dato se pierde sin avisar: se dice cuántas respuestas sin enviar se borrarían.
      message: pendientes > 0
        ? `Hay ${pendientes} ${pendientes === 1 ? 'respuesta sin enviar que se perderá' : 'respuestas sin enviar que se perderán'} para siempre. Envíelas antes si las necesita. Lo ya enviado al servidor no se borra.`
        : 'Se borrarán del teléfono las respuestas guardadas. Lo ya enviado al servidor no se borra.',
      confirmText: pendientes > 0 ? `Borrar también las ${pendientes}` : 'Borrar',
      tone: 'danger',
    });
    if (accepted) {
      await this.storage.limpiarFormularios();
      await this.contarPendientes();
      this.toast.show('Respuestas del teléfono eliminadas.');
    }
  }
}
