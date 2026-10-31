<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services\XlsForm;

use App\Domain\Forms\Services\ArithmeticExpressionEvaluator;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Lee la plantilla simple (hoja «Mi encuesta») y devuelve la misma vista previa que la importación
 * XLSForm: preguntas con ids temporales enlazados, errores (bloquean) y avisos.
 */
final class SimpleFormImporter
{
    /** @var list<array{row:int, sheet:string, message:string}> */
    private array $errors = [];

    /** @var list<array{row:int, sheet:string, message:string}> */
    private array $warnings = [];

    /** @var list<array<string, mixed>> */
    private array $questions = [];

    /** @var list<string> */
    private array $sections = [];

    /** @var array<string, string> N.º => id temporal */
    private array $byNumber = [];

    private string $sheetName = SimpleFormat::SHEET;

    /** Encabezado de la hoja en minúsculas sin tildes => clave de columna. */
    public static function headerMap(array $headerRow): array
    {
        $keys = [];
        foreach (SimpleFormat::COLUMNS as $key => $label) {
            $keys[SimpleFormat::key($label)] = $key;
        }
        $keys[SimpleFormat::key('Numero')] = 'number';
        $keys[SimpleFormat::key('No')] = 'number';
        $keys[SimpleFormat::key('Subpregunta de')] = 'parent';
        $keys[SimpleFormat::key('Si responde ir a')] = 'jumps';
        $keys[SimpleFormat::key('Saltos')] = 'jumps';

        $map = [];
        foreach ($headerRow as $column => $value) {
            $key = $keys[SimpleFormat::key((string) $value)] ?? null;
            if ($key !== null && ! in_array($key, $map, true)) {
                $map[$column] = $key;
            }
        }

        return $map;
    }

    /** @return array<string, mixed> */
    public function import(Worksheet $sheet): array
    {
        $this->sheetName = $sheet->getTitle();
        $data = $sheet->toArray(null, false, false, false);
        $columns = self::headerMap($data[0] ?? []);
        $rows = [];
        foreach (array_slice($data, 1, XlsFormImporter::MAX_ROWS + 1, true) as $index => $values) {
            $row = ['__row' => $index + 1];
            foreach ($columns as $column => $key) {
                $row[$key] = trim((string) ($values[$column] ?? ''));
            }
            if (trim(implode('', array_diff_key($row, ['__row' => 1]))) !== '') {
                $rows[] = $row;
            }
        }

        if ($rows === []) {
            $this->error(0, "La hoja «{$this->sheetName}» no tiene preguntas. Escríbelas debajo de los encabezados (la hoja «Ejemplo» no se importa).");

            return $this->result();
        }

        $this->readRows($rows);
        if (count($this->questions) > XlsFormImporter::MAX_QUESTIONS) {
            $this->error(0, 'El formulario admite como máximo '.XlsFormImporter::MAX_QUESTIONS.' preguntas; el archivo tiene '.count($this->questions).'.');
        }

        return $this->result();
    }

    /** @param list<array<string, mixed>> $rows */
    private function readRows(array $rows): void
    {
        $matrix = null;
        $pending = [];
        $autoNumber = 0;

        foreach ($rows as $row) {
            $line = $row['__row'];
            $typeLabel = $row['type'] ?? '';
            $text = preg_replace('/^\s*[↳>\-–]+\s*/u', '', $row['question'] ?? '') ?? '';

            if ($typeLabel === '' && $text === '') {
                continue;
            }
            if ($typeLabel === '') {
                $this->error($line, 'Falta el «Tipo» de la pregunta.');

                continue;
            }
            $type = SimpleFormat::typeOf($typeLabel);
            if ($type === null) {
                $this->error($line, "El tipo «{$typeLabel}» no existe. Elígelo de la lista desplegable.");

                continue;
            }

            if ($type[0] === null) { // Fila de matriz
                if ($matrix === null) {
                    $this->error($line, '«Fila de matriz» debe ir debajo de una fila de tipo «Matriz».');
                } elseif ($text === '') {
                    $this->error($line, 'La fila de la matriz no tiene texto en «Pregunta».');
                } else {
                    $this->questions[$matrix]['options']['rows'][] = Str::limit($text, 500, '');
                    if (in_array(SimpleFormat::key($row['required'] ?? ''), ['si', 'yes', 's', 'x', '1'], true)) {
                        $this->questions[$matrix]['required'] = true;
                    }
                }

                continue;
            }
            $matrix = null;

            if ($text === '' && $type[0] !== 'CALCULATE') {
                $this->error($line, 'Falta el texto de la «Pregunta».');

                continue;
            }

            $number = $row['number'] ?? '';
            $autoNumber++;
            $number = $number !== '' ? preg_replace('/\.0+$/', '', $number) : (string) $autoNumber;
            if (isset($this->byNumber[$number])) {
                $this->error($line, "El N.º {$number} está repetido.");

                continue;
            }

            $section = Str::limit(trim($row['section'] ?? ''), 250, '') ?: null;
            if ($section !== null && ! in_array($section, $this->sections, true)) {
                $this->sections[] = $section;
            } elseif ($section !== null && ($last = end($this->questions)) && $last['section_name'] !== $section) {
                $this->warn($line, "La sección «{$section}» aparece en filas separadas; sus preguntas se agrupan juntas.");
            }

            $question = $this->buildQuestion($row, $type[0], $type[1], $text, $section, $number);
            if ($question === null) {
                continue;
            }
            $this->byNumber[$number] = $question['temp_id'];
            $this->questions[] = $question;
            $index = count($this->questions) - 1;
            if ($type[0] === 'LIKERT') {
                $matrix = $index;
            }
            if (($row['jumps'] ?? '') !== '' || ($row['parent'] ?? '') !== '' || $type[0] === 'CALCULATE') {
                $pending[] = ['index' => $index, 'row' => $row];
            }
        }

        foreach ($this->questions as $question) {
            if ($question['type'] === 'LIKERT' && $question['options']['rows'] === []) {
                $this->error($question['row'], "La matriz «{$question['label']}» no tiene filas: agrega debajo filas de tipo «Fila de matriz».");
            }
        }

        $this->resolve($pending);
    }

    /** @return array<string, mixed>|null */
    private function buildQuestion(array $row, string $type, ?string $media, string $text, ?string $section, string $number): ?array
    {
        $line = $row['__row'];
        $options = null;
        $properties = [];
        $rawOptions = $row['options'] ?? '';

        switch ($type) {
            case 'SINGLE_CHOICE':
            case 'MULTIPLE_CHOICE':
            case 'RANKING':
                $options = SimpleFormat::splitOptions($rawOptions);
                if ($options === []) {
                    $this->error($line, 'Escribe las «Opciones» separadas por punto y coma (ej. Sí; No).');

                    return null;
                }
                if (count($options) === 1 && str_contains($rawOptions, ',')) {
                    $this->warn($line, 'Las opciones parecen separadas por comas; sepáralas con «;» para que sean opciones distintas.');
                }
                break;
            case 'LIKERT':
                $columns = SimpleFormat::splitOptions($rawOptions);
                $options = ['rows' => [], 'columns' => $columns !== [] ? $columns : SimpleFormat::DEFAULT_SCALE];
                break;
            case 'RATING':
                $levels = $rawOptions === '' ? 5 : (int) $rawOptions;
                if ($levels < 3 || $levels > 10) {
                    $this->warn($line, 'La calificación admite de 3 a 10 niveles; se usó 5.');
                    $levels = 5;
                }
                $properties = ['max_rating' => $levels, 'icon_type' => 'star'];
                break;
            case 'MULTIMEDIA':
                $properties = ['allowed_media' => $media ?? 'all', 'max_file_size_mb' => 20];
                break;
            case 'SIGNATURE':
                $properties = ['pen_color' => '#000000', 'background_color' => '#ffffff'];
                break;
            case 'GPS':
                $properties = ['capture_accuracy' => true, 'allow_manual_fallback' => true];
                break;
            case 'BARCODE':
                $properties = ['allowed_formats' => 'ALL', 'allow_manual_input' => true];
                break;
            case 'CALCULATE':
                $properties = ['expression' => $row['calculation'] ?? ''];
                break;
        }

        $format = $row['format'] ?? '';
        if ($format !== '') {
            $code = null;
            foreach (SimpleFormat::FORMATS as $label => $value) {
                if (SimpleFormat::key($label) === SimpleFormat::key($format) || $value === $format) {
                    $code = $value;
                }
            }
            if ($type !== 'TEXT') {
                $this->warn($line, '«Formato» solo se aplica a preguntas de tipo Texto; se ignoró.');
            } elseif ($code === null) {
                $this->warn($line, "El formato «{$format}» no existe (Cédula, Correo o Teléfono); quedó como texto libre.");
            } else {
                $properties['text_format'] = $code;
            }
        }
        if (($row['help'] ?? '') !== '') {
            $properties['help_text'] = $row['help'];
        }

        $required = SimpleFormat::key($row['required'] ?? '');
        if (! in_array($required, ['', 'si', 'no', 'yes', 's', 'n', 'x', '1', '0'], true)) {
            $this->warn($line, '«Obligatoria» debe ser Sí o No; se tomó como No.');
        }

        return [
            'temp_id' => (string) Str::uuid(),
            'row' => $line,
            'name' => $number,
            'type' => $type,
            'label' => Str::limit($text !== '' ? $text : 'Cálculo '.$number, 2000, ''),
            'required' => ! in_array($type, ['NOTE', 'CALCULATE'], true) && in_array($required, ['si', 'yes', 's', 'x', '1'], true),
            'options' => $options,
            'properties' => $properties,
            'section_name' => $section,
            'parent_temp_id' => null,
            'branch_rules' => [],
        ];
    }

    /** Saltos, subpreguntas y cálculos se enlazan por N.º cuando ya se conocen todas las preguntas. */
    private function resolve(array $pending): void
    {
        $position = [];
        foreach ($this->questions as $index => $question) {
            $position[$question['temp_id']] = $index;
        }

        foreach ($pending as $item) {
            $index = $item['index'];
            $row = $item['row'];
            $question = &$this->questions[$index];
            $line = $question['row'];

            $parentNumber = preg_replace('/\.0+$/', '', $row['parent'] ?? '');
            if ($parentNumber !== '') {
                $parentId = $this->byNumber[$parentNumber] ?? null;
                if ($parentId === null || $position[$parentId] >= $index
                    || $this->questions[$position[$parentId]]['section_name'] !== $question['section_name']) {
                    $this->warn($line, "«Subpregunta de» indica la {$parentNumber}, que no está antes en la misma sección; se importó como pregunta normal.");
                } else {
                    $question['parent_temp_id'] = $parentId;
                }
            }

            if (($row['jumps'] ?? '') !== '') {
                $question['branch_rules'] = $this->jumps($row['jumps'], $question, $index, $position);
            }

            if ($question['type'] === 'CALCULATE') {
                $question['properties']['expression'] = $this->expression((string) $question['properties']['expression'], $line, $index, $position);
            }
            unset($question);
        }
    }

    private function jumps(string $text, array $question, int $index, array $position): array
    {
        $line = $question['row'];
        if ($question['type'] !== 'SINGLE_CHOICE') {
            $this->warn($line, 'Los saltos solo funcionan en preguntas de «Opción única»; se ignoraron.');

            return [];
        }
        $options = array_map(fn ($option) => SimpleFormat::key((string) $option), $question['options']);
        $rules = array_map(fn ($i) => ['option_index' => $i, 'action' => 'CONTINUE', 'next_temp_id' => null], array_keys($options));

        foreach (preg_split('/[;\n]+/u', $text) ?: [] as $part) {
            if (trim($part) === '') {
                continue;
            }
            $pieces = preg_split('/\s*(?:→|->|=>|⇒)\s*/u', trim($part));
            if (count($pieces) !== 2) {
                $this->warn($line, 'No se entendió el salto «'.trim($part).'». Escríbelo así: No → 12  o  No → fin.');

                continue;
            }
            $option = array_search(SimpleFormat::key($pieces[0]), $options, true);
            if ($option === false) {
                $this->warn($line, "El salto menciona la opción «{$pieces[0]}», que no está en «Opciones».");

                continue;
            }
            $target = preg_replace('/^(n\.?º?|pregunta)\s*/iu', '', trim($pieces[1])) ?? '';
            $target = preg_replace('/\.0+$/', '', $target) ?? $target;
            if (in_array(SimpleFormat::key($target), ['fin', 'terminar', 'finalizar'], true)) {
                $rules[$option] = ['option_index' => $option, 'action' => 'END_FORM', 'next_temp_id' => null];

                continue;
            }
            $targetId = $this->byNumber[$target] ?? null;
            if ($targetId === null || $position[$targetId] <= $index) {
                $this->warn($line, "El salto va a la pregunta «{$target}», que no existe o está antes; se ignoró.");

                continue;
            }
            $rules[$option] = ['option_index' => $option, 'action' => 'GO_TO', 'next_temp_id' => $targetId];
        }

        return $rules;
    }

    private function expression(string $expression, int $line, int $index, array $position): string
    {
        $valid = $expression !== '';
        $converted = preg_replace_callback('/\[\s*(\d+)\s*\]/', function ($match) use (&$valid, $index, $position) {
            $id = $this->byNumber[$match[1]] ?? null;
            if ($id === null || $position[$id] >= $index || ! in_array($this->questions[$position[$id]]['type'], ['NUMBER', 'CALCULATE'], true)) {
                $valid = false;

                return $match[0];
            }

            return '${'.$id.'}';
        }, $expression) ?? $expression;

        $test = preg_replace('/\$\{[^}]+\}/', '1', $converted) ?? '';
        if (! $valid || (new ArithmeticExpressionEvaluator)->evaluate($test) === null) {
            $this->warn($line, 'El «Cálculo» usa + - * / y paréntesis con números de preguntas anteriores entre corchetes, ej. [3] + [4]; revísalo antes de guardar.');
        }

        return $converted;
    }

    private function error(int $row, string $message): void
    {
        $this->errors[] = ['row' => $row, 'sheet' => $this->sheetName, 'message' => $message];
    }

    private function warn(int $row, string $message): void
    {
        $this->warnings[] = ['row' => $row, 'sheet' => $this->sheetName, 'message' => $message];
    }

    /** @return array<string, mixed> */
    private function result(): array
    {
        return [
            'title' => null,
            'sections' => $this->sections,
            'questions' => $this->questions,
            'errors' => $this->errors,
            'warnings' => $this->warnings,
            'summary' => ['sections' => count($this->sections), 'questions' => count($this->questions)],
            'valid' => $this->errors === [] && $this->questions !== [],
        ];
    }
}
