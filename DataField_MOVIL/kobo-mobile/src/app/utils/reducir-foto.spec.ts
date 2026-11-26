import { vi } from 'vitest';
import { HerramientasImagen, medidasReducidas, reducirFoto } from './reducir-foto';

function foto(bytes: number, type = 'image/jpeg', name = 'IMG_0001.jpeg'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** Decodifica a las medidas dadas y "codifica" un JPEG del tamaño pedido. */
function herramientas(ancho: number, alto: number, bytesJpeg: number) {
  const dibujos: Array<[number, number]> = [];
  const cerrar = vi.fn();
  const h: HerramientasImagen = {
    decodificar: vi.fn(async () => ({ imagen: {} as CanvasImageSource, ancho, alto, cerrar })),
    lienzo: (w, hh) => ({
      width: w,
      height: hh,
      dibujar: (_img, a, b) => dibujos.push([a, b]),
      aJpeg: async () => new Blob([new Uint8Array(bytesJpeg)], { type: 'image/jpeg' }),
    }),
  };
  return { h, dibujos, cerrar };
}

describe('reducirFoto', () => {
  it('lleva el lado mayor a 1600 px manteniendo la proporción y no agranda fotos pequeñas', () => {
    expect(medidasReducidas(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
    expect(medidasReducidas(3000, 4000)).toEqual({ ancho: 1200, alto: 1600 });
    expect(medidasReducidas(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });

  it('una foto de cámara de 30 MB queda en un JPEG de ~0,5 MB', async () => {
    const { h, dibujos, cerrar } = herramientas(4000, 3000, 500_000);
    const resultado = await reducirFoto(foto(30 * 1024 * 1024, 'image/png', 'captura.png'), h);

    expect(resultado.size).toBe(500_000);
    expect(resultado.type).toBe('image/jpeg');
    expect(resultado.name).toBe('captura.jpg');
    expect(dibujos).toEqual([[1600, 1200]]);
    expect(cerrar).toHaveBeenCalled();
  });

  it('deja el original si la versión reducida no pesa menos', async () => {
    const original = foto(200_000);
    expect(await reducirFoto(original, herramientas(1000, 800, 250_000).h)).toBe(original);
  });

  it('deja el original si el navegador no puede decodificarla (p. ej. HEIC)', async () => {
    const original = foto(5_000_000);
    const { h } = herramientas(4000, 3000, 1);
    h.decodificar = vi.fn(async () => { throw new Error('formato no soportado'); });
    expect(await reducirFoto(original, h)).toBe(original);
  });

  it('no toca GIF (pueden ser animados) ni funciona sin las herramientas del navegador', async () => {
    const gif = foto(3_000_000, 'image/gif', 'a.gif');
    const { h } = herramientas(4000, 3000, 1000);
    expect(await reducirFoto(gif, h)).toBe(gif);
    expect(h.decodificar).not.toHaveBeenCalled();
    const jpg = foto(3_000_000);
    expect(await reducirFoto(jpg, null)).toBe(jpg);
  });
});
