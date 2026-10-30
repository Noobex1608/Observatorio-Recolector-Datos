/**
 * Formatos para preguntas de texto (`properties.text_format`): correo, cédula y teléfono de Ecuador.
 * Misma lógica que el backend (App\Domain\Forms\Services\TextFormat), que vuelve a validar al guardar.
 */
export type TextFormat = 'email' | 'cedula_ec' | 'telefono_ec';

export const TEXT_FORMATS: { value: TextFormat; label: string; defaultLabel: string; icon: string; hint: string }[] = [
  { value: 'email', label: 'Correo electrónico', defaultLabel: 'Correo electrónico', icon: 'alternate_email', hint: 'Valida nombre@dominio.ext' },
  { value: 'cedula_ec', label: 'Cédula (Ecuador)', defaultLabel: 'Número de cédula', icon: 'badge', hint: 'Valida provincia y dígito verificador' },
  { value: 'telefono_ec', label: 'Teléfono (Ecuador)', defaultLabel: 'Número de teléfono', icon: 'call', hint: 'Celular 09… o fijo 02…07…' },
];

export function textFormatOf(properties: unknown): TextFormat | null {
  const format = properties && typeof properties === 'object' ? (properties as { text_format?: unknown }).text_format : null;
  return format === 'email' || format === 'cedula_ec' || format === 'telefono_ec' ? format : null;
}

/** Atributos de entrada para que el celular muestre el teclado adecuado. */
export function textFormatInput(format: TextFormat | null): { type: string; inputmode: string; autocomplete: string; placeholder: string; maxlength: number } {
  switch (format) {
    case 'email': return { type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'nombre@dominio.com', maxlength: 254 };
    case 'cedula_ec': return { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '10 dígitos', maxlength: 13 };
    case 'telefono_ec': return { type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '09XXXXXXXX', maxlength: 20 };
    default: return { type: 'text', inputmode: 'text', autocomplete: 'off', placeholder: '', maxlength: 10000 };
  }
}

export function normalizeTextFormat(format: TextFormat, value: string): string {
  const trimmed = value.trim();
  if (format === 'email') return trimmed.toLowerCase();
  if (format === 'cedula_ec') return trimmed.replace(/[\s.-]/g, '');
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('593') && digits.length >= 11) digits = '0' + digits.slice(3);
  return digits;
}

/** Mensaje de error para el valor escrito, o null si es válido (o está vacío). */
export function textFormatError(format: TextFormat | null, raw: unknown): string | null {
  if (!format || typeof raw !== 'string' || raw.trim() === '') return null;
  const value = normalizeTextFormat(format, raw);
  if (format === 'email') {
    const at = value.lastIndexOf('@');
    const domain = value.slice(at + 1);
    const ok = value.length <= 254 && at > 0 && !/\s/.test(value) && domain.includes('.')
      && !domain.endsWith('.') && !domain.startsWith('.') && value.indexOf('@') === at;
    return ok ? null : 'Ingrese un correo electrónico válido (ej. nombre@dominio.com).';
  }
  if (format === 'telefono_ec') {
    return /^(09\d{8}|0[2-7]\d{7})$/.test(value)
      ? null : 'Ingrese un celular de 10 dígitos (09…) o un teléfono fijo de 9 dígitos (02… a 07…).';
  }
  if (!/^\d{10}$/.test(value)) return 'La cédula debe tener 10 dígitos.';
  const province = Number(value.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30) || Number(value[2]) >= 6) {
    return 'La cédula no es válida: revise los primeros dígitos.';
  }
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const product = Number(value[i]) * (i % 2 === 0 ? 2 : 1);
    sum += product > 9 ? product - 9 : product;
  }
  return (10 - (sum % 10)) % 10 === Number(value[9]) ? null : 'La cédula no es válida: revise el último dígito.';
}
