import { Injectable, inject } from '@angular/core';
import { mediaBudgetError } from './utils/media-limits';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { ACCOUNT_SCOPE_KEY, DbService } from './db.service';

import { MediaStorageService } from './services/media-storage.service';
import { zonaDeRespuesta } from './utils/zone-progress';

/** Títulos de los formularios que el servidor ya no ofrece, según lo que se hizo con cada uno. */
export interface FormulariosRetirados {
  /** Se quitaron del teléfono junto con el registro de lo enviado. */
  quitados: string[];
  /** Se conservan porque tienen borradores o encuestas sin enviar. */
  conPendientes: string[];
}

/** Aviso para el encuestador, o null si no se retiró nada. */
export function avisoRetirados({ quitados, conPendientes }: FormulariosRetirados): string | null {
  const partes: string[] = [];
  if (quitados.length > 0) {
    partes.push(quitados.length === 1
      ? `«${quitados[0]}» ya no está disponible (se archivó o se retiró) y se quitó del teléfono.`
      : `${quitados.length} formularios ya no están disponibles y se quitaron del teléfono.`);
  }
  if (conPendientes.length > 0) {
    partes.push(conPendientes.length === 1
      ? `«${conPendientes[0]}» ya no está disponible, pero tienes encuestas sin enviar de ese formulario: se conservan en el teléfono.`
      : `${conPendientes.length} formularios ya no están disponibles, pero tienen encuestas sin enviar: se conservan en el teléfono.`);
  }
  return partes.length > 0 ? partes.join(' ') : null;
}

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
          uses_zones: detalle.uses_zones ?? form.uses_zones,
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

        // Encuestas guardadas antes de este control: si sus archivos no caben, no se intenta enviar
        // (el servidor la rechazaría siempre) y se explica en «Listo para enviar».
        const sizes: number[] = [];
        for (const val of Object.values(payloadAnswers)) {
          if (val && typeof val === 'object' && (val as any).blobId) {
            const record = await this.mediaStorage.getMediaBlobById((val as any).blobId);
            sizes.push(record?.blob?.size ?? 0);
          }
        }
        const budgetError = mediaBudgetError(sizes);
        if (budgetError) throw Object.assign(new Error(budgetError), { reason: budgetError });

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
        await this.db.responses.update(resp.id!, { estado: 'enviado', errorEnvio: undefined });

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
        // Rechazos que no se arreglan reintentando: se guarda el motivo para mostrarlo al encuestador.
        const reason = error?.reason
          ?? (error?.status === 413 ? 'El servidor rechazó la encuesta porque sus archivos son demasiado grandes (máximo 35 MB por encuesta).' : null)
          ?? (error?.status === 422 ? (error?.error?.message || 'El servidor rechazó la encuesta: revisa sus respuestas.') : null);
        if (reason && resp.id !== undefined) {
          await this.db.responses.update(resp.id, { errorEnvio: reason }).catch(() => undefined);
        }
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
  async actualizarAvance(): Promise<FormulariosRetirados> {
    const sinCambios: FormulariosRetirados = { quitados: [], conPendientes: [] };
    const servidor = this.auth.obtenerUrlServidor();
    if (!servidor || !navigator.onLine || this.auth.esModoDemo()) return sinCambios;
    const metadata = await this.api.fetchFormsMetadata(servidor);
    const retirados = await this.retirarFormulariosNoDisponibles(new Set(metadata.map(meta => meta.id)));
    for (const meta of metadata) {
      const form = await this.db.forms.get(meta.id);
      if (!form) continue;
      const progress = new Map((meta.zones_progress ?? []).map(zone => [zone.id, zone]));
      await this.db.forms.update(meta.id, {
        target_responses: meta.target_responses ?? undefined,
        responses_count: meta.responses_count ?? undefined,
        uses_zones: meta.uses_zones ?? form.uses_zones,
        project_zones: (form.project_zones ?? []).map(zone => {
          const remote = progress.get(zone.id);
          return remote ? { ...zone, target_responses: remote.target_responses, responses_count: remote.responses_count } : zone;
        }),
      });
    }
    return retirados;
  }

  /**
   * Formularios del teléfono que el servidor ya no ofrece (archivados, eliminados o sin asignar):
   * se borra el registro de lo ya enviado (las respuestas siguen en el servidor) y, si no queda
   * nada por terminar o enviar, también el formulario. Borradores y pendientes de envío nunca se
   * tocan: en ese caso el formulario se conserva para no perderlos.
   */
  private async retirarFormulariosNoDisponibles(disponibles: Set<string>): Promise<FormulariosRetirados> {
    const resultado: FormulariosRetirados = { quitados: [], conPendientes: [] };
    const locales = await this.db.forms.toArray();
    for (const form of locales.filter(f => !disponibles.has(f.id))) {
      await this.limpiarEnviados([form.id]);
      const pendientes = await this.db.responses.where('formId').equals(form.id).count();
      if (pendientes === 0) {
        await this.db.forms.delete(form.id);
        resultado.quitados.push(form.title);
      } else {
        resultado.conPendientes.push(form.title);
      }
    }
    return resultado;
  }

  /**
   * Quita del teléfono el registro de las encuestas ya enviadas de esos formularios (y sus archivos
   * locales). Solo las de estado «enviado»: borradores y pendientes de envío se conservan.
   */
  async limpiarEnviados(formIds: string[]): Promise<number> {
    if (formIds.length === 0) return 0;
    return this.db.transaction('rw', this.db.responses, this.db.mediaBlobs, async () => {
      const ids = (await this.db.responses.where('formId').anyOf(formIds).filter(r => r.estado === 'enviado').primaryKeys())
        .filter((id): id is number => typeof id === 'number');
      if (ids.length === 0) return 0;
      await this.db.mediaBlobs.where('responseId').anyOf(ids).delete();
      await this.db.responses.bulkDelete(ids);
      return ids.length;
    });
  }

  async cantidadPendientes(): Promise<number> {
    return this.db.responses
      .where('estado')
      .equals('listo-para-enviar')
      .count();
  }
}
