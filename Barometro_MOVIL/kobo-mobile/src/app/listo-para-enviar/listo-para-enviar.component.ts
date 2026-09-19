import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { StorageService } from '../storage.service';
import { SyncService } from '../sync.service';
import { AuthService } from '../auth.service';
import { SavedResponse } from '../db.service';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast.service';
import { TranslatePipe } from '../translate.pipe';

@Component({
  selector: 'app-listo-para-enviar',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './listo-para-enviar.component.html',
  styleUrls: ['./listo-para-enviar.component.css']
})
export class ListoParaEnviarComponent implements OnInit {
  private storage = inject(StorageService);
  private sync = inject(SyncService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(ToastService);
  theme = inject(ThemeService);

  formularios: SavedResponse[] = [];
  seleccionados = new Set<number>();
  sending = false;
  totalToSend = 0;
  sentCount = 0;
  progressPercent = 0;
  isOnline = navigator.onLine;

  async ngOnInit() {
    this.formularios = (await this.storage.obtenerFormularios())
      .filter(f => f.estado === 'listo-para-enviar');
    this.cdr.detectChanges();
    window.addEventListener('online', () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);
  }

  isSeleccionado(form: SavedResponse) {
    return form.id !== undefined && this.seleccionados.has(form.id);
  }

  toggleSeleccion(form: SavedResponse) {
    if (form.id === undefined) return;
    if (this.seleccionados.has(form.id)) {
      this.seleccionados.delete(form.id);
    } else {
      this.seleccionados.add(form.id);
    }
  }

  seleccionarTodo() {
    const ids = this.formularios.map(f => f.id!).filter(id => id !== undefined);
    if (this.seleccionados.size === ids.length) {
      this.seleccionados.clear();
      return;
    }
    ids.forEach(id => this.seleccionados.add(id));
  }

  async enviarSeleccionados() {
    if (this.seleccionados.size === 0) {
      this.toast.show('Selecciona al menos un formulario para enviar.', 'info');
      return;
    }

    if (this.auth.esModoDemo()) {
      const ids = Array.from(this.seleccionados);
      this.sending = true;
      this.totalToSend = ids.length;
      this.sentCount = 0;
      this.progressPercent = 0;

      for (const id of ids) {
        await new Promise(r => setTimeout(r, 700));
        await this.storage.eliminarFormulario(id);
        this.sentCount++;
        this.progressPercent = Math.round((this.sentCount / this.totalToSend) * 100);
        this.formularios = (await this.storage.obtenerFormularios())
          .filter(f => f.estado === 'listo-para-enviar');
        this.cdr.detectChanges();
      }

      this.seleccionados.clear();
      this.sending = false;
      this.toast.show(`${this.sentCount} formulario(s) enviados.`);
      return;
    }

    if (!this.isOnline) {
      this.toast.show('No hay conexión. Los datos se enviarán cuando tengas conexión.', 'info');
      return;
    }

    this.sending = true;
    this.totalToSend = this.seleccionados.size;
    this.sentCount = 0;
    this.progressPercent = 0;
    this.cdr.detectChanges();

    const idsSeleccionados = Array.from(this.seleccionados);
    const { enviados, fallos } = await this.sync.enviarPendientes(idsSeleccionados);

    this.sentCount = enviados;
    this.sending = false;

    this.formularios = (await this.storage.obtenerFormularios())
      .filter(f => f.estado === 'listo-para-enviar');
    this.seleccionados.clear();
    this.cdr.detectChanges();

    if (fallos > 0) {
      this.toast.show(`Enviados: ${enviados}. Fallaron: ${fallos}.`, 'error');
    } else {
      this.toast.show(`${enviados} formulario(s) enviados correctamente.`);
    }
  }

  async eliminarSeleccionados() {
    if (this.seleccionados.size === 0) {
      this.toast.show('Selecciona al menos un formulario para eliminar.', 'info');
      return;
    }

    const ids = Array.from(this.seleccionados);
    for (const id of ids) {
      await this.storage.eliminarFormulario(id);
    }

    this.formularios = (await this.storage.obtenerFormularios())
      .filter(f => f.estado === 'listo-para-enviar');
    this.seleccionados.clear();
    this.cdr.detectChanges();
    this.toast.show(`${ids.length} formulario(s) eliminados.`);
  }

  async eliminarUno(form: SavedResponse) {
    if (form.id === undefined) return;
    await this.storage.eliminarFormulario(form.id);
    this.formularios = (await this.storage.obtenerFormularios())
      .filter(f => f.estado === 'listo-para-enviar');
    this.seleccionados.delete(form.id);
    this.cdr.detectChanges();
    this.toast.show('Formulario eliminado.');
  }

  volver() {
    this.router.navigate(['/']);
  }
}
