import { ProjectZoneInfo, SavedResponse } from '../db.service';

/** Zona declarada en una respuesta (la misma clave que cuenta el servidor). */
export function zonaDeRespuesta(answers: Record<string, any> | undefined | null): string | null {
  const geofence = answers?.['_project_geofence'];
  return geofence && typeof geofence.zone_id === 'string' ? geofence.zone_id : null;
}

/**
 * Encuestas que le faltan a la zona: meta − recibidas por el servidor (al último dato descargado)
 * − pendientes de envío en este teléfono. null = la zona no tiene meta.
 */
export function restantesZona(zone: ProjectZoneInfo, pendientesLocales: number): number | null {
  if (zone.target_responses == null || zone.target_responses <= 0) return null;
  return Math.max(0, zone.target_responses - (zone.responses_count ?? 0) - pendientesLocales);
}

/** Cuenta las respuestas pendientes de envío por zona. */
export function pendientesPorZona(pendientes: Pick<SavedResponse, 'answers'>[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const respuesta of pendientes) {
    const zoneId = zonaDeRespuesta(respuesta.answers);
    if (zoneId) counts[zoneId] = (counts[zoneId] ?? 0) + 1;
  }
  return counts;
}
