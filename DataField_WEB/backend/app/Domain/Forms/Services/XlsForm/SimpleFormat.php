<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services\XlsForm;

use Illuminate\Support\Str;

/**
 * Plantilla simple en español: una fila por pregunta, la sección como columna, las opciones en la
 * misma celda separadas por «;» y los saltos por número de pregunta («No → 5», «No → fin»).
 */
final class SimpleFormat
{
    public const SHEET = 'Mi encuesta';

    public const EXAMPLE_SHEET = 'Ejemplo';

    public const HELP_SHEET = 'Cómo llenarla';

    public const LISTS_SHEET = 'Listas';

    /** Encabezados en orden (columnas A…K). */
    public const COLUMNS = [
        'number' => 'N.º',
        'section' => 'Sección',
        'question' => 'Pregunta',
        'type' => 'Tipo',
        'options' => 'Opciones',
        'required' => 'Obligatoria',
        'format' => 'Formato',
        'help' => 'Ayuda',
        'jumps' => 'Si responde… ir a',
        'parent' => 'Subpregunta de (N.º)',
        'calculation' => 'Cálculo',
    ];

    public const MATRIX_ROW = 'Fila de matriz';

    /** Nombre en español => tipo del sistema (y tipo de archivo para multimedia). */
    public const TYPES = [
        'Opción única' => ['SINGLE_CHOICE', null, 'Una sola respuesta de una lista', 'Opciones separadas por «;»: Sí; No'],
        'Opción múltiple' => ['MULTIPLE_CHOICE', null, 'Varias respuestas de una lista', 'Opciones separadas por «;»'],
        'Ordenar' => ['RANKING', null, 'Ordenar opciones por preferencia', 'Opciones separadas por «;»'],
        'Matriz' => ['LIKERT', null, 'Escala para varias afirmaciones (Likert). Debajo, una fila «Fila de matriz» por afirmación', 'La escala separada por «;» (vacío = escala de acuerdo de 5 niveles)'],
        self::MATRIX_ROW => [null, null, 'Una afirmación de la matriz de arriba (va justo debajo de la fila «Matriz»)', '—'],
        'Texto' => ['TEXT', null, 'Respuesta escrita', '— (use la columna Formato para cédula, correo o teléfono)'],
        'Número' => ['NUMBER', null, 'Cantidad o valor numérico', '—'],
        'Fecha' => ['DATE', null, 'Una fecha', '—'],
        'Hora' => ['TIME', null, 'Una hora', '—'],
        'Fecha y hora' => ['DATETIME', null, 'Fecha con hora', '—'],
        'Calificación' => ['RATING', null, 'Escala de 1 a N (estrellas o números)', 'Cantidad de niveles: 3 a 10 (vacío = 5)'],
        'Ubicación GPS' => ['GPS', null, 'Coordenadas del lugar de la encuesta', '—'],
        'Foto' => ['MULTIMEDIA', 'image', 'Tomar o subir una foto', '—'],
        'Audio' => ['MULTIMEDIA', 'audio', 'Grabar audio', '—'],
        'Video' => ['MULTIMEDIA', 'video', 'Grabar video', '—'],
        'Archivo' => ['MULTIMEDIA', 'all', 'Foto, audio o video', '—'],
        'Firma' => ['SIGNATURE', null, 'Firma en pantalla', '—'],
        'Código QR o de barras' => ['BARCODE', null, 'Escanear un código', '—'],
        'Nota' => ['NOTE', null, 'Texto informativo, sin respuesta', '—'],
        'Cálculo' => ['CALCULATE', null, 'Resultado automático (columna Cálculo, ej. [3] + [4])', '—'],
    ];

    public const FORMATS = ['Cédula' => 'cedula_ec', 'Correo' => 'email', 'Teléfono' => 'telefono_ec'];

    public const DEFAULT_SCALE = ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo'];

    /** Clave comparable: minúsculas, sin tildes ni espacios repetidos. */
    public static function key(string $value): string
    {
        return Str::of($value)->ascii()->lower()->replaceMatches('/[^a-z0-9]+/', ' ')->trim()->toString();
    }

    /** @return array{0:?string, 1:?string}|null [tipo del sistema, medio] o null si no se reconoce */
    public static function typeOf(string $label): ?array
    {
        $key = self::key($label);
        $aliases = [
            'seleccion unica' => 'Opción única', 'unica' => 'Opción única', 'opcion' => 'Opción única',
            'seleccion multiple' => 'Opción múltiple', 'multiple' => 'Opción múltiple',
            'ranking' => 'Ordenar', 'likert' => 'Matriz', 'matriz likert' => 'Matriz',
            'fila' => self::MATRIX_ROW, 'afirmacion' => self::MATRIX_ROW,
            'numero entero' => 'Número', 'numerico' => 'Número', 'gps' => 'Ubicación GPS', 'ubicacion' => 'Ubicación GPS',
            'imagen' => 'Foto', 'fotografia' => 'Foto', 'multimedia' => 'Archivo', 'codigo' => 'Código QR o de barras',
            'qr' => 'Código QR o de barras', 'codigo de barras' => 'Código QR o de barras', 'escala' => 'Calificación',
            'calculo' => 'Cálculo', 'texto corto' => 'Texto', 'texto largo' => 'Texto',
        ];
        foreach (self::TYPES as $name => $definition) {
            if (self::key($name) === $key) {
                return [$definition[0], $definition[1]];
            }
        }
        $alias = $aliases[$key] ?? null;

        return $alias ? [self::TYPES[$alias][0], self::TYPES[$alias][1]] : null;
    }

    /** Nombre en español para un tipo del sistema. */
    public static function labelOf(string $type, ?string $media = null): string
    {
        $media = in_array($media, ['image', 'audio', 'video'], true) ? $media : 'all';
        foreach (self::TYPES as $name => [$system, $systemMedia]) {
            if ($system === $type && ($type !== 'MULTIMEDIA' || $systemMedia === $media)) {
                return $name;
            }
        }

        return 'Texto';
    }

    /** @return list<string> */
    public static function splitOptions(string $value): array
    {
        return array_values(array_filter(array_map('trim', preg_split('/\s*[;\n]\s*/u', $value) ?: []), fn ($item) => $item !== ''));
    }
}
