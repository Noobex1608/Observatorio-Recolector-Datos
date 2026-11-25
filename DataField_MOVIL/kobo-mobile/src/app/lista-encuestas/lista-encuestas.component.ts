import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DbService, FormDefinition } from '../db.service';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast.service';
import { AuthService } from '../auth.service';
import { SyncService, avisoRetirados } from '../sync.service';
import { pendientesPorZona, restantesZona } from '../utils/zone-progress';
import { hoyLocal } from '../utils/fecha-local';

interface FormWithProgress extends FormDefinition {
  enviadosCount: number;
  completado: boolean;
  expirado: boolean;
  noIniciado: boolean;
  /** Avance de las zonas con meta: cuántas encuestas faltan (descuenta lo pendiente en el teléfono). */
  zonasAvance: Array<{ id: string; name: string; meta: number; restantes: number }>;
}

@Component({
  selector: 'app-lista-encuestas',
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './lista-encuestas.component.html',
  styleUrls: ['./lista-encuestas.component.css']
})
export class ListaEncuestasComponent implements OnInit {
  private db = inject(DbService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  theme = inject(ThemeService);
  private toast = inject(ToastService);
  readonly auth = inject(AuthService);
  private sync = inject(SyncService);

  formularios: FormWithProgress[] = [];
  cargando = true;
  errorCarga = '';
  filtroTexto = '';

  ngOnInit(): void {
    void this.inicializar();
  }

  private async inicializar(): Promise<void> {
    await this.cargarFormularios();
    // Con conexión, trae el avance real de las metas (también lo que enviaron otros encuestadores).
    if (navigator.onLine) {
      try {
        const aviso = avisoRetirados(await this.sync.actualizarAvance());
        await this.cargarFormularios();
        if (aviso) this.toast.show(aviso, 'info');
      } catch {
        // Sin servidor se muestran los últimos datos guardados.
      }
    }
  }

  async cargarFormularios() {
    this.cargando = true;
    this.errorCarga = '';
    try {
      const forms = await this.db.forms.toArray();

      const enviados = await this.db.responses
        .where('estado')
        .equals('enviado')
        .toArray();

      const pendientes = await this.db.responses
        .where('estado')
        .equals('listo-para-enviar')
        .toArray();

      const enviadosByForm: Record<string, number> = {};
      for (const r of enviados) {
        enviadosByForm[r.formId] = (enviadosByForm[r.formId] ?? 0) + 1;
      }

      const pendientesByForm: Record<string, number> = {};
      for (const r of pendientes) {
        pendientesByForm[r.formId] = (pendientesByForm[r.formId] ?? 0) + 1;
      }

      const today = hoyLocal();
      const pendientesZona = pendientesPorZona(pendientes);

      this.formularios = forms.map(f => {
        const serverCount = f.responses_count ?? 0;
        const localPending = pendientesByForm[f.id] ?? 0;
        const totalCount = serverCount + localPending;
        const hasTarget = f.target_responses != null && f.target_responses > 0;
        const completado = hasTarget && totalCount >= f.target_responses!;
        const expirado = Boolean(f.end_date && today > f.end_date);
        const noIniciado = Boolean(f.start_date && today < f.start_date);

        const zonasAvance = (f.project_zones ?? []).flatMap(zone => {
          const restantes = restantesZona(zone, pendientesZona[zone.id] ?? 0);
          return restantes === null ? [] : [{ id: zone.id, name: zone.name, meta: zone.target_responses!, restantes }];
        });

        return {
          ...f,
          enviadosCount: totalCount,
          completado,
          expirado,
          noIniciado,
          zonasAvance,
        };
      });
    } catch {
      this.formularios = [];
    }
    this.cargando = false;
    this.cdr.detectChanges();
  }

  get formulariosFiltrados(): FormWithProgress[] {
    if (!this.filtroTexto.trim()) return this.formularios;
    const q = this.filtroTexto.toLowerCase().trim();
    return this.formularios.filter(f => 
      f.title.toLowerCase().includes(q) || 
      (f.description && f.description.toLowerCase().includes(q))
    );
  }

  /** Abre la encuesta; si no se puede llenar, explica por qué en lugar de no hacer nada. */
  irALlenar(form: Pick<FormWithProgress, 'id' | 'start_date' | 'end_date' | 'completado' | 'expirado' | 'noIniciado'>) {
    if (form.noIniciado) {
      this.toast.show(`Esta encuesta se habilita el ${form.start_date}. Aún no se pueden registrar respuestas.`, 'info');
      return;
    }
    if (form.expirado) {
      this.toast.show(`El periodo de esta encuesta terminó el ${form.end_date}. Ya no se registran respuestas.`, 'info');
      return;
    }
    if (form.completado) {
      this.toast.show('Ya se alcanzó la meta de respuestas de esta encuesta.', 'info');
      return;
    }
    void this.router.navigate(['/llenar', form.id]);
  }

  trackById(_index: number, form: FormDefinition) {
    return form.id;
  }

}
