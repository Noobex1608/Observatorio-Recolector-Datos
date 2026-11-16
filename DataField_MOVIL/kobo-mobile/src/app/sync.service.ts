import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { ACCOUNT_SCOPE_KEY, DbService } from './db.service';

import { MediaStorageService } from './services/media-storage.service';
import { zonaDeRespuesta } from './utils/zone-progress';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private db = inject(DbService);
  private mediaStorage = inject(MediaStorageService);

  async obtenerFormulariosDisponibles(): Promise<{ id: string; title: string }[]> {
    const servidor = this.auth.obtenerUrlServidor();
    if (!servidor) throw new Error('No hay servidor configurado');
    // Solo hace falta id y título: los metadatos no incluyen preguntas ni zonas, así que pesan mucho menos.
    const forms = await this.api.fetchFormsMetadata(servidor);
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
        // /mobile/forms ya trae preguntas, zonas, cuota y fechas (mismo formato que /forms/{id}),
        // así que no se vuelve a pedir cada formulario: una sola petición para toda la descarga.
        const detalle = form;
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
            properties: q.properties,
            hint: q.hint,
            calculation_expression: q.calculation_expression,
            media_type: q.media_type,
            section_name: q.section_name,
            parent_question_id: q.parent_question_id,
          })),
          downloadedAt: Date.now(),
          target_responses: detalle.target_responses,
          responses_count: detalle.responses_count,
          step_by_step: detalle.step_by_step ?? false,
          require_consent: detalle.require_consent ?? form.require_consent ?? true,
          consent_text: detalle.consent_text ?? form.consent_text ?? null,
          start_date: detalle.start_date || form.start_date || null,
          end_date: detalle.end_date || form.end_date || null,
          project_id: detalle.project_id || form.project_id,
          project_name: detalle.project_name || form.project_name,
          project_zones: detalle.project_zones || form.project_zones || [],
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

    const accountScope = localStorage.getItem(ACCOUNT_SCOPE_KEY);
    const assertAccount = () => {
      if (!accountScope || accountScope !== localStorage.getItem(ACCOUNT_SCOPE_KEY) || this.db.name !== `KoboMobileDB:${accountScope}`) {
        throw new Error('La cuenta cambió durante la sincronización.');
      }
    };
    assertAccount();
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
        // Upgrade pending records atomically: concurrent tabs must use the same key.
        const submissionId = await this.db.transaction('rw', this.db.responses, async () => {
          const current = await this.db.responses.get(resp.id!);
          if (!current) throw new Error('Respuesta no encontrada.');
          const key = current.clientSubmissionId ?? crypto.randomUUID();
          if (!current.clientSubmissionId) await this.db.responses.update(resp.id!, { clientSubmissionId: key });
          return key;
        });
        const payloadAnswers = JSON.parse(JSON.stringify(resp.answers));

        // Preprocesar Blobs multimedia y firmas
        for (const [key, val] of Object.entries(payloadAnswers)) {
          if (val && typeof val === 'object' && (val as any).blobId) {
            const blobId = (val as any).blobId;
            const record = await this.mediaStorage.getMediaBlobById(blobId);
            if (!record?.blob) {
              throw new Error(`Falta el archivo asociado a la respuesta ${key}. No se enviará incompleta.`);
            }
            const base64Data = await this.mediaStorage.blobToDataUrl(record.blob);
            (payloadAnswers[key] as any).dataUrl = base64Data;
          }
        }

        assertAccount();
        await this.api.submitResponse(servidor, resp.link_uuid, payloadAnswers, submissionId);
        await this.db.responses.update(resp.id!, { estado: 'enviado' });

        const form = await this.db.forms.get(resp.formId);
        if (form) {
          // La zona también suma una encuesta recibida, para que "faltan N" baje sin esperar a otra descarga.
          const zoneId = zonaDeRespuesta(payloadAnswers);
          await this.db.forms.update(resp.formId, {
            responses_count: (form.responses_count ?? 0) + 1,
            project_zones: (form.project_zones ?? []).map(zone =>
              zone.id === zoneId ? { ...zone, responses_count: (zone.responses_count ?? 0) + 1 } : zone),
          });
        }

        enviados++;
      } catch (error: any) {
        console.error('[Sync] Error enviando respuesta:', error?.status, error?.message || error);
        fallos++;
      }
    }

    if (enviados > 0) {
      // Trae el avance real (incluye lo que enviaron los demás encuestadores). Si falla, se queda el conteo local.
      await this.actualizarAvance().catch(() => undefined);
    }

    return { enviados, fallos };
  }

  /**
   * Actualiza, sin volver a descargar preguntas ni mapas, las metas y el avance de los formularios
   * guardados en el teléfono: el del encuestador y el de cada zona.
   */
  async actualizarAvance(): Promise<void> {
    const servidor = this.auth.obtenerUrlServidor();
    if (!servidor || !navigator.onLine || this.auth.esModoDemo()) return;
    const metadata = await this.api.fetchFormsMetadata(servidor);
    for (const meta of metadata) {
      const form = await this.db.forms.get(meta.id);
      if (!form) continue;
      const progress = new Map((meta.zones_progress ?? []).map(zone => [zone.id, zone]));
      await this.db.forms.update(meta.id, {
        target_responses: meta.target_responses ?? undefined,
        responses_count: meta.responses_count ?? undefined,
        project_zones: (form.project_zones ?? []).map(zone => {
          const remote = progress.get(zone.id);
          return remote ? { ...zone, target_responses: remote.target_responses, responses_count: remote.responses_count } : zone;
        }),
      });
    }
  }

  async cantidadPendientes(): Promise<number> {
    return this.db.responses
      .where('estado')
      .equals('listo-para-enviar')
      .count();
  }
}
