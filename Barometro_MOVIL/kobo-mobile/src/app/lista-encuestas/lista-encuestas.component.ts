import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DbService, FormDefinition } from '../db.service';
import { ThemeService } from '../theme.service';
import { FieldTrackingService } from '../field-tracking.service';
import { ToastService } from '../toast.service';
import { AuthService } from '../auth.service';

interface FormWithProgress extends FormDefinition {
  enviadosCount: number;
  completado: boolean;
  expirado: boolean;
  noIniciado: boolean;
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
  tracking = inject(FieldTrackingService);
  private toast = inject(ToastService);
  readonly auth = inject(AuthService);
  trackingZoneByForm: Record<string, string> = {};

  formularios: FormWithProgress[] = [];
  cargando = true;
  errorCarga = '';
  filtroTexto = '';

  async ngOnInit() {
    await this.cargarFormularios();
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

      const today = new Date().toISOString().split('T')[0];

      this.formularios = forms.map(f => {
        const serverCount = f.responses_count ?? 0;
        const localPending = pendientesByForm[f.id] ?? 0;
        const totalCount = serverCount + localPending;
        const hasTarget = f.target_responses != null && f.target_responses > 0;
        const completado = hasTarget && totalCount >= f.target_responses!;
        const expirado = Boolean(f.end_date && today > f.end_date);
        const noIniciado = Boolean(f.start_date && today < f.start_date);

        return {
          ...f,
          enviadosCount: totalCount,
          completado,
          expirado,
          noIniciado,
        };
      });
      for (const form of this.formularios) {
        const zones = form.project_zones ?? [];
        if (!zones.some(zone => zone.id === this.trackingZoneByForm[form.id])) {
          if (zones.length > 0) this.trackingZoneByForm[form.id] = zones[0].id;
          else delete this.trackingZoneByForm[form.id];
        }
      }
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

  irALlenar(formId: string, disabled: boolean) {
    if (disabled) return;
    this.router.navigate(['/llenar', formId]);
  }

  trackById(_index: number, form: FormDefinition) {
    return form.id;
  }

  async startTracking(form: FormDefinition, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.auth.obtenerRol() !== 'RECOLECTOR') {
      this.toast.show('Inicia sesión con la cuenta recolectora asignada para compartir tu ubicación.', 'error');
      return;
    }
    const zoneId = this.trackingZoneByForm[form.id] || form.project_zones?.[0]?.id;
    if (!zoneId) { this.toast.show('No hay zona asignada para esta encuesta.', 'error'); return; }
    try {
      await this.tracking.start(form.id, zoneId);
      this.toast.show('Jornada de campo iniciada. Ubicación visible para supervisión.');
    } catch (error: any) {
      await this.cargarFormularios();
      this.toast.show(error?.error?.message || error?.message || 'No se pudo iniciar la jornada.', 'error');
    }
  }

  async stopTracking(event: Event): Promise<void> {
    event.stopPropagation();
    await this.tracking.stop();
    this.toast.show('Jornada de campo finalizada.');
  }
}
