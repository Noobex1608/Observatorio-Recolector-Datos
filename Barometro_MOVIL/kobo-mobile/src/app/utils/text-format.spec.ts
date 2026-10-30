import { normalizeTextFormat, textFormatError, textFormatOf } from './text-format';

describe('Formatos de texto', () => {
  it('valida correos', () => {
    expect(textFormatError('email', ' Ana@ULEAM.edu.ec ')).toBeNull();
    expect(textFormatError('email', 'ana@uleam')).not.toBeNull();
    expect(textFormatError('email', 'ana uleam@x.com')).not.toBeNull();
  });

  it('valida cédulas ecuatorianas con su dígito verificador', () => {
    expect(textFormatError('cedula_ec', '1710034065')).toBeNull();
    expect(textFormatError('cedula_ec', '171003406-5')).toBeNull();
    expect(textFormatError('cedula_ec', '1300000005')).toBeNull();
    expect(textFormatError('cedula_ec', '1710034066')).toBe('La cédula no es válida: revise el último dígito.');
    expect(textFormatError('cedula_ec', '2510034065')).toBe('La cédula no es válida: revise los primeros dígitos.');
    expect(textFormatError('cedula_ec', '12345')).toBe('La cédula debe tener 10 dígitos.');
  });

  it('valida y normaliza teléfonos', () => {
    expect(normalizeTextFormat('telefono_ec', '+593 99 123 4567')).toBe('0991234567');
    expect(textFormatError('telefono_ec', '(05) 262-3740')).toBeNull();
    expect(textFormatError('telefono_ec', '9912345678')).not.toBeNull();
  });

  it('el texto libre y las respuestas vacías no se validan', () => {
    expect(textFormatError(null, 'cualquier cosa')).toBeNull();
    expect(textFormatError('cedula_ec', '')).toBeNull();
    expect(textFormatOf({ text_format: 'pasaporte' })).toBeNull();
    expect(textFormatOf({ text_format: 'email' })).toBe('email');
  });
});
