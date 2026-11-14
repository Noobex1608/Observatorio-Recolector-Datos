import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Location } from '@angular/common';
import { AuthService } from '../auth.service';
import { StorageService } from '../storage.service';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast.service';
import { ApiService } from '../api.service';
import { DbService } from '../db.service';
import { Router } from '@angular/router';
import { TranslatePipe } from '../translate.pipe';

@Component({
  selector: 'app-ajustes',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './ajustes.component.html',
  styleUrls: ['./ajustes.component.css']
})
export class AjustesComponent {
  private location = inject(Location);
  private auth = inject(AuthService);
  private storage = inject(StorageService);
  private toast = inject(ToastService);
  private api = inject(ApiService);
  private db = inject(DbService);
  private router = inject(Router);
  theme = inject(ThemeService);

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
    const accepted = await this.toast.confirm({
      title: 'Borrar datos locales',
      message: this.theme.t('delete_confirm'),
      confirmText: 'Borrar',
      tone: 'danger',
    });
    if (accepted) {
      await this.storage.limpiarFormularios();
      this.toast.show('Datos locales eliminados.');
    }
  }

  verAcercaDe() {
    this.toast.show('ULEAM DataField ' + this.theme.t('version'), 'info', 4000);
  }
}
