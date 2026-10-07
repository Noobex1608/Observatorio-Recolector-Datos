import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DbService, SavedResponse } from '../db.service';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast.service';
import { TranslatePipe } from '../translate.pipe';

@Component({
  selector: 'app-enviados',
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './enviados.component.html',
  styleUrls: ['./enviados.component.css']
})
export class EnviadosComponent implements OnInit {
  private db = inject(DbService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(ToastService);
  theme = inject(ThemeService);

  enviados: SavedResponse[] = [];
  cargando = true;

  mostrarConfirmacionBorrar = false;
  borrando = false;

  respuestaDetalle: SavedResponse | null = null;

  async ngOnInit() {
    await this.cargarEnviados();
  }

  async cargarEnviados() {
    try {
      this.enviados = await this.db.responses
        .where('estado')
        .equals('enviado')
        .reverse()
        .toArray();
    } catch {
      this.enviados = [];
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  iniciarBorrarTodos() {
    if (this.enviados.length === 0) return;
    this.mostrarConfirmacionBorrar = true;
    this.cdr.detectChanges();
  }

  cancelarBorrar() {
    this.mostrarConfirmacionBorrar = false;
  }

  async confirmarBorrarTodos() {
    this.mostrarConfirmacionBorrar = false;
    this.borrando = true;
    this.cdr.detectChanges();

    try {
      const ids = this.enviados.map(e => e.id).filter((id): id is number => id !== undefined);
      await this.db.responses.bulkDelete(ids);
      await this.cargarEnviados();
      this.toast.show('Historial de envíos limpiado correctamente.');
    } catch {
      this.toast.show('Error al limpiar el historial.', 'error');
    }

    this.borrando = false;
    this.cdr.detectChanges();
  }

  verRespuestas(resp: SavedResponse) {
    this.respuestaDetalle = resp;
    this.cdr.detectChanges();
  }

  cerrarDetalle() {
    this.respuestaDetalle = null;
    this.cdr.detectChanges();
  }

  obtenerClavesRespuestas(answers: Record<string, any>): { key: string; val: string }[] {
    if (!answers || typeof answers !== 'object') return [];
    return Object.entries(answers).map(([key, val]) => ({
      key,
      val: typeof val === 'object' ? JSON.stringify(val) : String(val ?? 'Sin respuesta')
    }));
  }

  volver() {
    this.router.navigate(['/']);
  }
}
