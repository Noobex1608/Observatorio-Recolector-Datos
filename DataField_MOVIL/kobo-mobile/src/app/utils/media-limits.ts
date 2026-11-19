/**
 * Límites de archivos por respuesta, iguales a los del servidor (RESPONSE_MEDIA_MAX_TOTAL_BYTES y
 * RESPONSE_MEDIA_MAX_FILES). Si se superan, el servidor rechaza el envío (413) cada vez que se reintenta,
 * así que se revisan en el teléfono antes de dar la encuesta por terminada.
 */
export const MAX_RESPONSE_MEDIA_BYTES = 35 * 1024 * 1024;
export const MAX_RESPONSE_MEDIA_FILES = 10;

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.0', '')} MB`;
}

/** Mensaje para el encuestador si los archivos de una respuesta no caben; null si están dentro del límite. */
export function mediaBudgetError(sizes: number[]): string | null {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (sizes.length > MAX_RESPONSE_MEDIA_FILES) {
    return `La encuesta tiene ${sizes.length} archivos y el máximo es ${MAX_RESPONSE_MEDIA_FILES}. Quita alguno antes de terminar.`;
  }
  if (total > MAX_RESPONSE_MEDIA_BYTES) {
    return `Las fotos, audios y videos de esta encuesta suman ${formatMb(total)} y el máximo por encuesta es ${formatMb(MAX_RESPONSE_MEDIA_BYTES)}. `
      + 'Graba videos más cortos o quita alguno antes de terminar.';
  }
  return null;
}
