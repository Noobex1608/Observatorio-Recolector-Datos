import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DbService } from '../db.service';
import { AuthService } from '../auth.service';
import { SyncService } from '../sync.service';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast.service';
import { TranslatePipe } from '../translate.pipe';

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, CommonModule, TranslatePipe],
  templateUrl: './inicio.component.html',
  styleUrls: ['./inicio.component.css']
})
export class InicioComponent implements OnInit, OnDestroy {
  private db = inject(DbService);
  private auth = inject(AuthService);
  private sync = inject(SyncService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(ToastService);
  theme = inject(ThemeService);

  cargando = false;
  enviando = false;
  cantidadListos = 0;
  cantidadBorradores = 0;
  cantidadDescargados = 0;
  isOnline = true;
  urlServidor: string | null = null;
  nombreUsuario: string | null = null;
  mostrarMenuPerfil = false;

  mostrarSelectorDescarga = false;
  formulariosDisponibles: { id: string; title: string }[] = [];
  seleccionDescarga = new Set<string>();
  descargandoSeleccion = false;

  mostrarSelectorBorrar = false;
  formulariosLocales: { id: string; title: string; downloadedAt: number }[] = [];
  seleccionBorrar = new Set<string>();
  borrandoSeleccion = false;

  async ngOnInit() {
    await this.cargarContadores();
    this.urlServidor = this.auth.obtenerUrlServidor();
    this.nombreUsuario = this.auth.obtenerUsuario();
    this.isOnline = navigator.onLine;
    this.cdr.detectChanges();
    window.addEventListener('online', this.actualizarEstadoRed);
    window.addEventListener('offline', this.actualizarEstadoRed);
  }

  ngOnDestroy() {
    window.removeEventListener('online', this.actualizarEstadoRed);
    window.removeEventListener('offline', this.actualizarEstadoRed);
  }

  async cargarContadores() {
    this.cantidadListos = await this.sync.cantidadPendientes();
    this.cantidadBorradores = await this.db.responses.where('estado').equals('borrador').count();
    this.cantidadDescargados = await this.db.forms.count();
  }

  actualizarEstadoRed = () => {
    this.isOnline = navigator.onLine;
    this.cdr.detectChanges();
  };

  toggleMenuPerfil() {
    this.mostrarMenuPerfil = !this.mostrarMenuPerfil;
  }

  cerrarMenuPerfil() {
    this.mostrarMenuPerfil = false;
  }

  get inicialUsuario(): string {
    return this.nombreUsuario?.charAt(0).toUpperCase() ?? 'U';
  }

  abrirSeccion(nombre: string) {
    if (nombre === 'Listo para enviar') {
      this.router.navigate(['/listo-para-enviar']);
    } else if (nombre === 'Borradores') {
      this.router.navigate(['/borradores']);
    } else if (nombre === 'Enviado') {
      this.router.navigate(['/enviados']);
    } else if (nombre === 'Borrar formulario') {
      this.iniciarBorrar();
    }
  }

  async iniciarBorrar() {
    if (this.borrandoSeleccion) return;
    this.borrandoSeleccion = true;
    this.cdr.detectChanges();

    this.formulariosLocales = (await this.db.forms.toArray()).map(f => ({
      id: f.id,
      title: f.title,
      downloadedAt: f.downloadedAt
    }));

    this.borrandoSeleccion = false;

    if (this.formulariosLocales.length === 0) {
      this.toast.show('No hay formularios descargados para borrar.', 'info');
      return;
    }

    this.mostrarSelectorBorrar = true;
    this.cdr.detectChanges();
  }

  toggleSeleccionBorrar(id: string) {
    if (this.seleccionBorrar.has(id)) {
      this.seleccionBorrar.delete(id);
    } else {
      this.seleccionBorrar.add(id);
    }
  }

  seleccionarTodosBorrar() {
    if (this.seleccionBorrar.size === this.formulariosLocales.length) {
      this.seleccionBorrar.clear();
    } else {
      this.formulariosLocales.forEach(f => this.seleccionBorrar.add(f.id));
    }
  }

  async confirmarBorrar() {
    if (this.seleccionBorrar.size === 0) {
      this.toast.show('Selecciona al menos un formulario para borrar.', 'info');
      return;
    }

    this.mostrarSelectorBorrar = false;
    this.borrandoSeleccion = true;
    this.cdr.detectChanges();

    const ids = Array.from(this.seleccionBorrar);
    await Promise.all(ids.map(id => this.db.forms.delete(id)));
    this.seleccionBorrar.clear();
    this.borrandoSeleccion = false;

    await this.cargarContadores();
    this.toast.show(`Se eliminaron ${ids.length} formulario(s) del dispositivo.`);
    this.cdr.detectChanges();
  }

  cancelarBorrar() {
    this.mostrarSelectorBorrar = false;
    this.seleccionBorrar.clear();
  }

  irAjustes() {
    this.router.navigate(['/ajustes']);
  }

  irPerfil() {
    this.router.navigate(['/perfil']);
  }

  verAcercaDe() {
    this.toast.show('ULEAM ' + this.theme.t('version'), 'info', 4000);
  }

  async iniciarDescarga() {
    if (this.descargandoSeleccion) return;
    if (!this.isOnline) {
      this.toast.show('No puedes descargar sin conexión a internet.', 'error');
      return;
    }

    this.descargandoSeleccion = true;
    this.cdr.detectChanges();

    try {
      this.formulariosDisponibles = await this.sync.obtenerFormulariosDisponibles();
      this.descargandoSeleccion = false;

      if (this.formulariosDisponibles.length === 0) {
        this.toast.show('No hay formularios disponibles en el servidor.', 'info');
        return;
      }

      this.mostrarSelectorDescarga = true;
    } catch {
      this.descargandoSeleccion = false;
      this.toast.show('Error al conectar con el servidor.', 'error');
    }

    this.cdr.detectChanges();
  }

  toggleSeleccionDescarga(id: string) {
    if (this.seleccionDescarga.has(id)) {
      this.seleccionDescarga.delete(id);
    } else {
      this.seleccionDescarga.add(id);
    }
  }

  seleccionarTodosLosFormularios() {
    if (this.seleccionDescarga.size === this.formulariosDisponibles.length) {
      this.seleccionDescarga.clear();
    } else {
      this.formulariosDisponibles.forEach(f => this.seleccionDescarga.add(f.id));
    }
  }

  async confirmarDescarga() {
    if (this.seleccionDescarga.size === 0) {
      this.toast.show('Selecciona al menos un formulario.', 'info');
      return;
    }

    this.mostrarSelectorDescarga = false;
    this.descargandoSeleccion = true;
    this.cdr.detectChanges();

    try {
      const ids = Array.from(this.seleccionDescarga);
      const { descargados, errores } = await this.sync.sincronizarFormularios(ids);
      this.descargandoSeleccion = false;
      this.seleccionDescarga.clear();

      await this.cargarContadores();
      const msgs: string[] = [];
      if (descargados > 0) msgs.push(`${descargados} formulario(s) descargados.`);
      if (errores > 0) msgs.push(`${errores} con errores.`);
      this.toast.show(msgs.length > 0 ? msgs.join(' ') : 'No se descargó ningún formulario.');
    } catch {
      this.descargandoSeleccion = false;
      this.toast.show('Error al descargar formularios.', 'error');
    }

    this.cdr.detectChanges();
  }

  cancelarDescarga() {
    this.mostrarSelectorDescarga = false;
    this.seleccionDescarga.clear();
  }

  async enviarFormulariosAlServidor() {
    this.cantidadListos = await this.sync.cantidadPendientes();
    if (this.cantidadListos === 0) return;

    if (!this.isOnline) {
      this.toast.show('Estás offline! Los datos se enviarán cuando recuperes conexión.', 'info');
      return;
    }

    this.enviando = true;
    this.cdr.detectChanges();

    try {
      const { enviados, fallos } = await this.sync.enviarPendientes();
      this.enviando = false;
      await this.cargarContadores();

      const msgs: string[] = [];
      if (enviados > 0) msgs.push(`${enviados} formulario(s) subidos.`);
      if (fallos > 0) msgs.push(`${fallos} fallaron.`);
      this.toast.show(msgs.join(' '));
    } catch {
      this.enviando = false;
      this.toast.show('Error al enviar formularios.', 'error');
    }

    this.cdr.detectChanges();
  }

  cerrarSesion() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
