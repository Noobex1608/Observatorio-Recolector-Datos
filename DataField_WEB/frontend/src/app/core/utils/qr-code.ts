/** QR Code byte-mode encoder, error correction level M, versions 1–10. */
const DATA_CODEWORDS = [0, 16, 28, 44, 64, 86, 108, 124, 154, 182, 216];
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

function gfMultiply(a: number, b: number): number {
  let product = 0;
  for (let i = 7; i >= 0; i--) {
    product = (product << 1) ^ ((product >>> 7) * 0x11d);
    product ^= ((b >>> i) & 1) * a;
  }
  return product;
}

function rsDivisor(degree: number): number[] {
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = Array(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMultiply(divisor[i], factor);
  }
  return result;
}

function rawModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
  }
  if (version >= 7) result -= 36;
  return result;
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = Math.ceil((size - 13) / (count - 1) / 2) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = DATA_CODEWORDS.findIndex((capacity, index) => index > 0
    && bytes.length <= (capacity * 8 - 4 - (index <= 9 ? 8 : 16) - 4) / 8);
  if (version < 1) throw new Error('El enlace es demasiado largo para generar el QR.');
  const capacity = DATA_CODEWORDS[version];
  const bits: number[] = [];
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  append(0b0100, 4);
  append(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((byte) => append(byte, 8));
  append(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }
  for (let pad = 0; codewords.length < capacity; pad++) codewords.push(pad % 2 ? 0x11 : 0xec);

  const eccLength = ECC_PER_BLOCK[version];
  const blockCount = BLOCKS[version];
  const rawCodewords = Math.floor(rawModules(version) / 8);
  const shortBlockCount = blockCount - rawCodewords % blockCount;
  const shortBlockLength = Math.floor(rawCodewords / blockCount);
  const divisor = rsDivisor(eccLength);
  const blocks: Array<{ data: number[]; ecc: number[] }> = [];
  let offset = 0;
  for (let i = 0; i < blockCount; i++) {
    const length = shortBlockLength - eccLength + (i < shortBlockCount ? 0 : 1);
    const data = codewords.slice(offset, offset + length);
    offset += length;
    blocks.push({ data, ecc: rsRemainder(data, divisor) });
  }
  const interleaved: number[] = [];
  for (let i = 0; i < Math.max(...blocks.map((block) => block.data.length)); i++) {
    for (const block of blocks) if (i < block.data.length) interleaved.push(block.data[i]);
  }
  for (let i = 0; i < eccLength; i++) for (const block of blocks) interleaved.push(block.ecc[i]);

  const size = version * 4 + 17;
  const matrix = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const functional = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    if (x >= 0 && y >= 0 && x < size && y < size) {
      matrix[y][x] = dark;
      functional[y][x] = true;
    }
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, distance !== 2 && distance !== 4);
    }
  }
  const positions = alignmentPositions(version);
  for (let i = 0; i < positions.length; i++) for (let j = 0; j < positions.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === positions.length - 1)
      || (i === positions.length - 1 && j === 0)) continue;
    const cx = positions[i];
    const cy = positions[j];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  // Format data: error correction M and mask 0.
  const format = 0x5412;
  const bit = (i: number) => ((format >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const encoded = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((encoded >>> i) & 1) !== 0;
      const a = size - 11 + i % 3;
      const b = Math.floor(i / 3);
      set(a, b, dark); set(b, a, dark);
    }
  }

  const dataBits = interleaved.flatMap((byte) => Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1));
  let index = 0;
  for (let column = size - 1; column >= 1; column -= 2) {
    // La columna 6 es el patrón de sincronización: a partir de ahí se desplaza una a la izquierda.
    const right = column <= 6 ? column - 1 : column;
    for (let vertical = 0; vertical < size; vertical++) {
      const y = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset++) {
        const x = right - offset;
        if (functional[y][x]) continue;
        matrix[y][x] = ((dataBits[index++] ?? 0) !== 0) !== ((x + y) % 2 === 0);
      }
    }
  }
  return matrix;
}

export function qrDataUrl(text: string, scale = 6): string {
  const matrix = qrMatrix(text);
  const border = 4;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = (matrix.length + border * 2) * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo dibujar el código QR.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) context.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
  }));
  return canvas.toDataURL('image/png');
}
