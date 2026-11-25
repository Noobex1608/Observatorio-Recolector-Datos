/**
 * Fecha de hoy (YYYY-MM-DD) según el reloj del teléfono, no en UTC.
 * `new Date().toISOString()` da la fecha UTC: en Ecuador (UTC−5), desde las 19:00 ya es "mañana",
 * y un formulario se mostraría cerrado horas antes de que termine su último día (el servidor
 * compara en hora de Ecuador).
 */
export function hoyLocal(fecha: Date = new Date()): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
