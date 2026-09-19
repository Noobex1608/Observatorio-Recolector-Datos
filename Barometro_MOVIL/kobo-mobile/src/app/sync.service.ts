import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { DbService } from './db.service';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private db = inject(DbService);

  async obtenerFormulariosDisponibles(): Promise<{ id: string; title: string }[]> {
    const servidor = this.auth.obtenerUrlServidor();
    if (!servidor) throw new Error('No hay servidor configurado');
    const forms = await this.api.fetchForms(servidor);
    return forms.map(f => ({ id: f.id, title: f.title }));
  }

  async sincronizarFormularios(ids?: string[]): Promise<{ descargados: number; errores: number }> {
    const servidor = this.auth.obtenerUrlServidor();
    if (!servidor) throw new Error('No hay servidor configurado');

    const forms = await this.api.fetchForms(servidor);
    const aDescargar = ids && ids.length > 0
      ? forms.filter(f => ids.includes(f.id))
      : forms;

    let descargados = 0;
    let errores = 0;

    for (const form of aDescargar) {
      try {
        const detalle = await this.api.fetchFormById(servidor, form.id);
        await this.db.forms.put({
          id: detalle.id,
          title: detalle.title,
          description: detalle.description,
          link_uuid: detalle.link_uuid,
          questions: detalle.questions.map(q => ({
            id: q.id,
            type: q.type,
            label: q.label,
            options: q.options,
            required: q.required,
            order: q.order,
            likert_rows: q.likert_rows,
            likert_columns: q.likert_columns,
            branch_rules: q.branch_rules,
          })),
          downloadedAt: Date.now(),
          target_responses: detalle.target_responses,
          responses_count: detalle.responses_count,
          step_by_step: detalle.step_by_step ?? false,
        });
        descargados++;
      } catch {
        errores++;
      }
    }

    return { descargados, errores };
  }

  async enviarPendientes(ids?: number[]): Promise<{ enviados: number; fallos: number }> {
    const servidor = this.auth.obtenerUrlServidor();
    if (!servidor) throw new Error('No hay servidor configurado');

    let pendientes = await this.db.responses
      .where('estado')
      .equals('listo-para-enviar')
      .toArray();

    if (ids && ids.length > 0) {
      pendientes = pendientes.filter(r => r.id !== undefined && ids.includes(r.id));
    }

    let enviados = 0;
    let fallos = 0;

    for (const resp of pendientes) {
      try {
        await this.api.submitResponse(servidor, resp.link_uuid, resp.answers);
        await this.db.responses.update(resp.id!, { estado: 'enviado' });

        const form = await this.db.forms.get(resp.formId);
        if (form) {
          await this.db.forms.update(resp.formId, {
            responses_count: (form.responses_count ?? 0) + 1,
          });
        }

        enviados++;
      } catch (error: any) {
        console.error('[Sync] Error enviando respuesta:', error?.status, error?.message || error);
        fallos++;
      }
    }

    return { enviados, fallos };
  }

  async cantidadPendientes(): Promise<number> {
    return this.db.responses
      .where('estado')
      .equals('listo-para-enviar')
      .count();
  }
}
