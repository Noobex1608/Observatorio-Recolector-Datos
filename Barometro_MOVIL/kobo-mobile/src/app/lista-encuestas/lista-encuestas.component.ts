import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DbService, FormDefinition } from '../db.service';
import { ThemeService } from '../theme.service';
import { TranslatePipe } from '../translate.pipe';

interface FormWithProgress extends FormDefinition {
  enviadosCount: number;
  completado: boolean;
}

@Component({
  selector: 'app-lista-encuestas',
  imports: [RouterLink, CommonModule, TranslatePipe],
  templateUrl: './lista-encuestas.component.html',
  styleUrls: ['./lista-encuestas.component.css']
})
export class ListaEncuestasComponent implements OnInit {
  private db = inject(DbService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  theme = inject(ThemeService);

  formularios: FormWithProgress[] = [];
  cargando = true;
  errorCarga = '';

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

      this.formularios = forms.map(f => {
        const serverCount = f.responses_count ?? 0;
        const localPending = pendientesByForm[f.id] ?? 0;
        const totalCount = serverCount + localPending;
        const hasTarget = f.target_responses != null && f.target_responses > 0;
        const completado = hasTarget && totalCount >= f.target_responses!;

        return {
          ...f,
          enviadosCount: totalCount,
          completado,
        };
      });
    } catch {
      this.formularios = [];
    }
    this.cargando = false;
    if (this.formularios.length === 0) {
      this.errorCarga = 'No hay formularios descargados. Presiona "Descargar formulario" en el inicio para sincronizar.';
    }
    this.cdr.detectChanges();
  }

  irALlenar(formId: string) {
    this.router.navigate(['/llenar', formId]);
  }

  trackById(_index: number, form: FormDefinition) {
    return form.id;
  }
}
