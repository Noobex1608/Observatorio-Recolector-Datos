/** Duración máxima de video de una pregunta multimedia: entre 5 y 120 s, 60 si no está configurada. */
export function maxVideoSeconds(properties: { max_video_seconds?: unknown } | null | undefined): number {
  const seconds = Math.round(Number(properties?.max_video_seconds ?? 60));
  return Number.isFinite(seconds) ? Math.min(120, Math.max(5, seconds)) : 60;
}

/** Lee la duración (segundos) de un video sin cargarlo entero; null si el navegador no la puede leer. */
export function readVideoDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(value);
    };
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    video.src = url;
  });
}
