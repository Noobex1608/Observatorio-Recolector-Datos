/**
 * Reduce las fotos antes de guardarlas en el teléfono y enviarlas: lado mayor de 1600 px y JPEG al 80 %.
 * Una foto de cámara de 5 a 30 MB queda en ~0,3-0,6 MB: menos datos móviles, menos espacio en el
 * teléfono y mucha menos memoria en el servidor (cada foto de 30 MB le costaba ~100 MB).
 * También quita los metadatos EXIF; la orientación se respeta al decodificar.
 * Si el navegador no puede decodificar la imagen (p. ej. HEIC) o el resultado no pesa menos, se deja
 * el archivo original: nunca se pierde la foto por intentar reducirla.
 */

export const LADO_MAXIMO_FOTO = 1600;
export const CALIDAD_FOTO = 0.8;

/** Tipos que se reducen. GIF no (puede ser animado); SVG no es una foto. */
const REDUCIBLES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export interface Lienzo {
  width: number;
  height: number;
  dibujar(imagen: CanvasImageSource, ancho: number, alto: number): void;
  aJpeg(calidad: number): Promise<Blob | null>;
}

export interface HerramientasImagen {
  decodificar(archivo: Blob): Promise<{ imagen: CanvasImageSource; ancho: number; alto: number; cerrar(): void }>;
  lienzo(ancho: number, alto: number): Lienzo;
}

/** Medidas finales manteniendo la proporción; no agranda fotos pequeñas. */
export function medidasReducidas(ancho: number, alto: number, maximo = LADO_MAXIMO_FOTO): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (mayor <= maximo) return { ancho, alto };
  const escala = maximo / mayor;
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

function herramientasDelNavegador(): HerramientasImagen | null {
  if (typeof createImageBitmap !== 'function') return null;
  return {
    async decodificar(archivo) {
      const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
      return { imagen: bitmap, ancho: bitmap.width, alto: bitmap.height, cerrar: () => bitmap.close() };
    },
    lienzo(ancho, alto) {
      const offscreen = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(ancho, alto) : null;
      const canvas = offscreen ?? Object.assign(document.createElement('canvas'), { width: ancho, height: alto });
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      return {
        width: ancho,
        height: alto,
        dibujar(imagen, w, h) {
          if (!ctx) throw new Error('Sin contexto 2D');
          // Fondo blanco: un PNG con transparencia no queda negro al pasar a JPEG.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(imagen, 0, 0, w, h);
        },
        aJpeg(calidad) {
          if (offscreen) return offscreen.convertToBlob({ type: 'image/jpeg', quality: calidad });
          return new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, 'image/jpeg', calidad));
        },
      };
    },
  };
}

export async function reducirFoto(
  archivo: File,
  herramientas: HerramientasImagen | null = herramientasDelNavegador(),
): Promise<File> {
  if (!herramientas || !REDUCIBLES.has(archivo.type.toLowerCase())) return archivo;
  let decodificada: Awaited<ReturnType<HerramientasImagen['decodificar']>> | null = null;
  try {
    decodificada = await herramientas.decodificar(archivo);
    const { ancho, alto } = medidasReducidas(decodificada.ancho, decodificada.alto);
    const lienzo = herramientas.lienzo(ancho, alto);
    lienzo.dibujar(decodificada.imagen, ancho, alto);
    const jpeg = await lienzo.aJpeg(CALIDAD_FOTO);
    if (!jpeg || jpeg.size === 0 || jpeg.size >= archivo.size) return archivo;
    const nombre = (archivo.name.replace(/\.[^./\\]+$/, '') || 'foto') + '.jpg';
    return new File([jpeg], nombre, { type: 'image/jpeg', lastModified: archivo.lastModified });
  } catch {
    return archivo;
  } finally {
    decodificada?.cerrar();
  }
}
