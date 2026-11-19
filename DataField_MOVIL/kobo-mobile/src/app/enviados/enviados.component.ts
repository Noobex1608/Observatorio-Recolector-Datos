import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DbService, FormQuestion, SavedResponse } from '../db.service';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast.service';
import { TranslatePipe } from '../translate.pipe';

/** Una respuesta lista para leer: el texto de la pregunta y el valor en palabras. */
interface RespuestaLegible {
  key: string;
  label: string;
  valor: string;
  vacia: boolean;
}

@Component({
  selector: 'app-enviados',
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './enviados.component.html',
  styleUrls: ['../estilos/pantalla-lista.css', './enviados.component.css']
})
export class EnviadosComponent implements OnInit {
  private db = inject(DbService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private toast = inject(ToastService);
  theme = inject(ThemeService);

  enviados: SavedResponse[] = [];
  cargando = true;
  borrando = false;

  respuestaDetalle: SavedResponse | null = null;
  detalle: RespuestaLegible[] = [];

  ngOnInit(): void {
    void this.cargarEnviados();
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

  /** Quita el registro local de lo enviado; las respuestas siguen en el servidor. */
  async limpiarHistorial() {
    if (this.enviados.length === 0) return;
    const accepted = await this.toast.confirm({
      title: 'Limpiar historial',
      message: `Se quitará de este teléfono el registro de ${this.enviados.length === 1 ? '1 encuesta enviada' : this.enviados.length + ' encuestas enviadas'}. Las respuestas siguen guardadas en el servidor.`,
      confirmText: 'Limpiar',
      tone: 'danger',
    });
    if (!accepted) return;

    this.borrando = true;
    try {
      const ids = this.enviados.map(e => e.id).filter((id): id is number => id !== undefined);
      await this.db.transaction('rw', this.db.responses, this.db.mediaBlobs, async () => {
        await this.db.responses.bulkDelete(ids);
        await this.db.mediaBlobs.where('responseId').anyOf(ids).delete();
      });
      await this.cargarEnviados();
      this.toast.show('Historial limpiado. Las respuestas siguen en el servidor.');
    } catch {
      this.toast.show('No se pudo limpiar el historial. Vuelve a intentarlo.', 'error');
    } finally {
      this.borrando = false;
      this.cdr.detectChanges();
    }
  }

  async verRespuestas(resp: SavedResponse) {
    const form = await this.db.forms.get(resp.formId).catch(() => undefined);
    this.detalle = this.respuestasLegibles(resp.answers, form?.questions ?? []);
    this.respuestaDetalle = resp;
    this.cdr.detectChanges();
  }

  cerrarDetalle() {
    this.respuestaDetalle = null;
    this.detalle = [];
    this.cdr.detectChanges();
  }

  /**
   * Respuestas en el orden del formulario y con el texto de cada pregunta. Si el formulario ya no está
   * en el teléfono, se muestran igual, sin el texto de la pregunta.
   */
  respuestasLegibles(answers: Record<string, any>, questions: FormQuestion[]): RespuestaLegible[] {
    if (!answers || typeof answers !== 'object') return [];
    const visibles = questions.filter(q => q.type !== 'NOTE');
    if (visibles.length > 0) {
      return visibles.map(q => this.legible(q.id, q.label, answers[q.id], q.type));
    }
    return Object.entries(answers)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, val], index) => this.legible(key, `Pregunta ${index + 1}`, val));
  }

  private legible(key: string, label: string, val: any, type?: string): RespuestaLegible {
    const vacia = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
    if (vacia) return { key, label, valor: 'Sin respuesta', vacia: true };
    let valor: string;
    if (Array.isArray(val)) {
      valor = val.map(item => String(item)).join(', ');
    } else if (typeof val === 'object') {
      if (typeof val.latitude === 'number' && typeof val.longitude === 'number') {
        valor = `${val.latitude.toFixed(5)}, ${val.longitude.toFixed(5)}`
          + (typeof val.accuracy === 'number' ? ` (±${Math.round(val.accuracy)} m)` : '');
      } else if (val.blobId || val.dataUrl || val.path || val.mediaType) {
        valor = type === 'SIGNATURE' ? 'Firma capturada' : `Archivo adjunto${val.mediaType ? ` (${String(val.mediaType).toLowerCase()})` : ''}`;
      } else {
        // Matriz Likert u otras respuestas por filas: «fila: valor» en líneas.
        valor = Object.entries(val).map(([fila, v]) => `${fila}: ${String(v)}`).join('\n');
      }
    } else if (typeof val === 'string' && val.startsWith('data:image')) {
      valor = type === 'SIGNATURE' ? 'Firma capturada' : 'Imagen adjunta';
    } else {
      valor = String(val);
    }
    return { key, label, valor, vacia: false };
  }

  volver() {
    void this.router.navigate(['/']);
  }
}
