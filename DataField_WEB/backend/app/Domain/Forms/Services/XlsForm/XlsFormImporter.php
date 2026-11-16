<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services\XlsForm;

use App\Domain\Forms\Services\ArithmeticExpressionEvaluator;
use App\Domain\Forms\Services\TextFormat;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Convierte un cuestionario en formato XLSForm (KoboToolbox / ODK) en preguntas del constructor.
 *
 * No guarda nada: devuelve una vista previa con las preguntas, los errores (bloquean) y los avisos
 * (lo que no se pudo convertir). Además del estándar acepta tres columnas propias:
 *  - `formato`: email | cedula_ec | telefono_ec para preguntas de texto;
 *  - `saltos`: «opción => nombre_destino; otra => fin» en preguntas de opción única;
 *  - `subpregunta_de`: nombre de la pregunta padre.
 */
final class XlsFormImporter
{
    public const MAX_ROWS = 2000;

    public const MAX_QUESTIONS = 500;

    /** Tipos de metadatos de XLSForm que el sistema ya registra por su cuenta. */
    private const METADATA_TYPES = [
        'start', 'end', 'today', 'deviceid', 'subscriberid', 'simserial', 'phonenumber',
        'username', 'email', 'audit', 'start-geopoint', 'hidden', 'xml-external', 'csv-external',
    ];

    private const TRUE_VALUES = ['yes', 'true', 'true()', '1', 'si', 'sí', 'y'];

    /** @var list<array{row:int, sheet:string, message:string}> */
    private array $errors = [];

    /** @var list<array{row:int, sheet:string, message:string}> */
    private array $warnings = [];

    /** @var array<string, list<array{name:string, label:string}>> */
    private array $choices = [];

    /** @var array<string, string> nombre XLSForm => id temporal */
    private array $nameToTempId = [];

    /** @var list<array<string, mixed>> */
    private array $questions = [];

    /** @var list<string> */
    private array $sections = [];

    private int $skippedMetadata = 0;

    /** @return array<string, mixed> */
    public function import(string $path): array
    {
        try {
            $reader = IOFactory::createReaderForFile($path);
            $reader->setReadDataOnly(true);
            $spreadsheet = $reader->load($path);
        } catch (\Throwable) {
            return $this->fail('El archivo no se pudo leer. Usa un .xlsx con las hojas «survey» y «choices».');
        }

        try {
            $survey = $this->sheet($spreadsheet->getAllSheets(), 'survey');
            if (! $survey) {
                return $this->fail('Falta la hoja «survey». Descarga la plantilla para ver el formato.');
            }
            $choicesSheet = $this->sheet($spreadsheet->getAllSheets(), 'choices');
            $settingsSheet = $this->sheet($spreadsheet->getAllSheets(), 'settings');

            if ($choicesSheet) {
                $this->readChoices($this->rows($choicesSheet));
            }
            $surveyRows = $this->rows($survey);
            if (count($surveyRows) > self::MAX_ROWS) {
                return $this->fail('La hoja «survey» tiene más de '.self::MAX_ROWS.' filas.');
            }
            $this->readSurvey($surveyRows);
            $title = $settingsSheet ? $this->readTitle($this->rows($settingsSheet)) : null;
        } finally {
            $spreadsheet->disconnectWorksheets();
        }

        if (count($this->questions) === 0 && count($this->errors) === 0) {
            $this->error(0, 'survey', 'No se encontró ninguna pregunta para importar.');
        }
        if (count($this->questions) > self::MAX_QUESTIONS) {
            $this->error(0, 'survey', 'El formulario admite como máximo '.self::MAX_QUESTIONS.' preguntas; el archivo tiene '.count($this->questions).'.');
        }
        if ($this->skippedMetadata > 0) {
            $this->warn(0, 'survey', "Se omitieron {$this->skippedMetadata} campo(s) de metadatos (start, end, deviceid…): el sistema ya registra fecha, usuario y dispositivo.");
        }

        return [
            'title' => $title,
            'sections' => $this->sections,
            'questions' => $this->questions,
            'errors' => $this->errors,
            'warnings' => $this->warnings,
            'summary' => ['sections' => count($this->sections), 'questions' => count($this->questions)],
            'valid' => count($this->errors) === 0,
        ];
    }

    /** @param list<array<string, string>> $rows */
    private function readSurvey(array $rows): void
    {
        $section = null;
        /** @var list<array{kind:string, label:string, name:string, row:int, buffer:list<array<string,mixed>>}> $groups */
        $groups = [];
        $pendingLinks = [];

        foreach ($rows as $row) {
            $line = $row['__row'];
            [$type, $listName] = $this->parseType($row['type'] ?? '');
            $label = $this->labelOf($row);
            $name = trim($row['name'] ?? '');

            if ($type === '' && $label === '' && $name === '') {
                continue;
            }

            if ($type === 'begin_group' || $type === 'begin_repeat') {
                $appearance = Str::lower($row['appearance'] ?? '');
                $kind = str_contains($appearance, 'table-list') ? 'likert' : 'group';
                if ($type === 'begin_repeat') {
                    $this->warn($line, 'survey', 'Los grupos repetibles no existen en el sistema; sus preguntas se importan una sola vez.');
                    $kind = 'group';
                }
                $groups[] = ['kind' => $kind, 'label' => $label !== '' ? $label : $name, 'name' => $name, 'row' => $line, 'buffer' => []];
                if ($kind === 'group' && $this->openSectionDepth($groups) === 1) {
                    $section = $label !== '' ? $label : ($name !== '' ? $name : 'Sección '.(count($this->sections) + 1));
                    $section = Str::limit($section, 250, '');
                    if (! in_array($section, $this->sections, true)) {
                        $this->sections[] = $section;
                    }
                } elseif ($kind === 'group') {
                    $this->warn($line, 'survey', "El grupo «{$label}» está dentro de otro grupo; sus preguntas quedan en la sección «{$section}».");
                }

                continue;
            }

            if ($type === 'end_group' || $type === 'end_repeat') {
                $group = array_pop($groups);
                if (! $group) {
                    $this->error($line, 'survey', 'Hay un «end_group» sin su «begin_group».');

                    continue;
                }
                if ($group['kind'] === 'likert') {
                    $this->closeLikert($group, $section, $pendingLinks);
                }
                if ($group['kind'] === 'group' && $this->openSectionDepth($groups) === 0) {
                    $section = null;
                }

                continue;
            }

            $current = end($groups);
            if ($current && $current['kind'] === 'likert') {
                $groups[array_key_last($groups)]['buffer'][] = $row + ['__type' => $type, '__list' => $listName];

                continue;
            }

            $this->addQuestion($row, $type, $listName, $section, $pendingLinks);
        }

        foreach ($groups as $group) {
            $this->error($group['row'], 'survey', "El grupo «{$group['label']}» no tiene «end_group».");
        }

        $this->resolveLinks($pendingLinks);
    }

    /**
     * @param  array<string, string>  $row
     * @param  list<array<string, mixed>>  $pendingLinks
     */
    private function addQuestion(array $row, string $type, ?string $listName, ?string $section, array &$pendingLinks): void
    {
        $line = (int) $row['__row'];
        $name = trim($row['name'] ?? '');
        $label = $this->labelOf($row);
        $hint = $this->hintOf($row);
        $appearance = Str::lower($row['appearance'] ?? '');

        if (in_array($type, self::METADATA_TYPES, true)) {
            $this->skippedMetadata++;

            return;
        }

        $properties = [];
        $options = null;
        $mapped = match ($type) {
            'select_one' => 'SINGLE_CHOICE',
            'select_multiple' => 'MULTIPLE_CHOICE',
            'rank' => 'RANKING',
            'text' => 'TEXT',
            'integer', 'decimal' => 'NUMBER',
            'date' => 'DATE',
            'time' => 'TIME',
            'datetime' => 'DATETIME',
            'geopoint' => 'GPS',
            'note', 'acknowledge' => 'NOTE',
            'calculate' => 'CALCULATE',
            'barcode' => 'BARCODE',
            'range' => 'RATING',
            'image' => str_contains($appearance, 'signature') ? 'SIGNATURE' : 'MULTIMEDIA',
            'audio', 'video', 'file' => 'MULTIMEDIA',
            default => null,
        };

        if ($mapped === null) {
            $message = in_array($type, ['geotrace', 'geoshape'], true)
                ? 'Las líneas y áreas en el mapa (geotrace / geoshape) no se pueden capturar; la fila se omitió.'
                : ($type === '' ? 'La fila no tiene tipo; se omitió.' : "El tipo «{$type}» no existe en el sistema; la fila se omitió.");
            $this->warn($line, 'survey', $message);

            return;
        }

        if (in_array($mapped, ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'RANKING'], true)) {
            $options = $this->optionsFor($listName, $line);
            if ($options === null) {
                return;
            }
        }

        if ($label === '' && $mapped !== 'CALCULATE') {
            $this->error($line, 'survey', 'La pregunta no tiene texto en la columna «label».');

            return;
        }

        switch ($mapped) {
            case 'TEXT':
                $format = Str::lower(trim($row['formato'] ?? $row['format'] ?? ''));
                if ($format !== '') {
                    if (in_array($format, TextFormat::FORMATS, true)) {
                        $properties['text_format'] = $format;
                    } else {
                        $this->warn($line, 'survey', "El formato «{$format}» no existe (usa email, cedula_ec o telefono_ec); quedó como texto libre.");
                    }
                }
                break;
            case 'NOTE':
                if ($type === 'acknowledge') {
                    $this->warn($line, 'survey', '«acknowledge» se importó como nota informativa.');
                }
                break;
            case 'MULTIMEDIA':
                $properties['allowed_media'] = match ($type) {
                    'image' => 'image', 'audio' => 'audio', 'video' => 'video', default => 'all',
                };
                $properties['max_file_size_mb'] = 20;
                break;
            case 'SIGNATURE':
                $properties += ['pen_color' => '#000000', 'background_color' => '#ffffff'];
                break;
            case 'GPS':
                $properties += ['capture_accuracy' => true, 'allow_manual_fallback' => true];
                break;
            case 'BARCODE':
                $properties += ['allowed_formats' => 'ALL', 'allow_manual_input' => true];
                break;
            case 'RATING':
                $end = $this->rangeEnd($row['parameters'] ?? '');
                $max = max(3, min(10, $end ?? 5));
                if ($end !== null && $end !== $max) {
                    $this->warn($line, 'survey', "La escala va de 3 a 10 niveles; se ajustó a {$max}.");
                }
                $properties += ['max_rating' => $max, 'icon_type' => 'number'];
                break;
            case 'CALCULATE':
                $properties['expression'] = trim($row['calculation'] ?? '');
                if ($label === '') {
                    $label = $name !== '' ? $name : 'Cálculo';
                }
                break;
        }

        if ($hint !== '') {
            $properties['help_text'] = $hint;
        }
        if (trim($row['relevant'] ?? '') !== '') {
            $this->warn($line, 'survey', 'La condición «relevant» (mostrar solo si…) no se importó; configúrala con los saltos por opción.');
        }
        if (trim($row['constraint'] ?? '') !== '') {
            $this->warn($line, 'survey', 'La restricción «constraint» no se importó.');
        }

        $tempId = (string) Str::uuid();
        if ($name !== '') {
            if (isset($this->nameToTempId[$name])) {
                $this->error($line, 'survey', "El nombre «{$name}» está repetido.");
            }
            $this->nameToTempId[$name] = $tempId;
        }

        $question = [
            'temp_id' => $tempId,
            'row' => $line,
            'name' => $name,
            'type' => $mapped,
            'label' => Str::limit($label, 2000, ''),
            'required' => $mapped !== 'NOTE' && $mapped !== 'CALCULATE' && in_array(Str::lower(trim($row['required'] ?? '')), self::TRUE_VALUES, true),
            'options' => $options,
            'properties' => $properties,
            'section_name' => $section,
            'parent_temp_id' => null,
            'branch_rules' => [],
        ];
        $this->questions[] = $question;

        $jumps = trim($row['saltos'] ?? '');
        $parent = trim($row['subpregunta_de'] ?? '');
        if ($jumps !== '' || $parent !== '' || $mapped === 'CALCULATE') {
            $pendingLinks[] = ['index' => count($this->questions) - 1, 'jumps' => $jumps, 'parent' => $parent];
        }
    }

    /**
     * Un grupo con apariencia «table-list» cuyas filas son select_one de la misma lista es una matriz Likert.
     *
     * @param  array{kind:string, label:string, name:string, row:int, buffer:list<array<string,mixed>>}  $group
     * @param  list<array<string, mixed>>  $pendingLinks
     */
    private function closeLikert(array $group, ?string $section, array &$pendingLinks): void
    {
        $rows = $group['buffer'];
        $allSelectOne = $rows !== [] && collect($rows)->every(fn ($row) => $row['__type'] === 'select_one');
        if (! $allSelectOne) {
            $this->warn($group['row'], 'survey', "El grupo «{$group['label']}» no es una matriz (todas sus filas deben ser select_one); sus preguntas se importaron por separado.");
            foreach ($rows as $row) {
                $this->addQuestion($row, $row['__type'], $row['__list'], $section, $pendingLinks);
            }

            return;
        }

        $list = $rows[0]['__list'];
        if (collect($rows)->contains(fn ($row) => $row['__list'] !== $list)) {
            $this->warn($group['row'], 'survey', "Las filas de la matriz «{$group['label']}» usan listas distintas; se tomaron las columnas de «{$list}».");
        }
        $columns = $this->optionsFor($list, (int) $rows[0]['__row']);
        if ($columns === null) {
            return;
        }

        $tempId = (string) Str::uuid();
        if ($group['name'] !== '') {
            $this->nameToTempId[$group['name']] = $tempId;
        }
        $this->questions[] = [
            'temp_id' => $tempId,
            'row' => $group['row'],
            'name' => $group['name'],
            'type' => 'LIKERT',
            'label' => Str::limit($group['label'] !== '' ? $group['label'] : 'Matriz', 2000, ''),
            'required' => collect($rows)->contains(fn ($row) => in_array(Str::lower(trim($row['required'] ?? '')), self::TRUE_VALUES, true)),
            'options' => [
                'rows' => array_values(array_map(fn ($row) => $this->labelOf($row) ?: trim($row['name'] ?? ''), $rows)),
                'columns' => $columns,
            ],
            'properties' => [],
            'section_name' => $section,
            'parent_temp_id' => null,
            'branch_rules' => [],
        ];
    }

    /** Resuelve referencias por nombre: subpreguntas, saltos y expresiones de cálculo. */
    private function resolveLinks(array $pendingLinks): void
    {
        $position = [];
        foreach ($this->questions as $index => $question) {
            $position[$question['temp_id']] = $index;
        }

        foreach ($pendingLinks as $link) {
            $question = &$this->questions[$link['index']];
            $line = $question['row'];

            if ($link['parent'] !== '') {
                $parentId = $this->nameToTempId[$link['parent']] ?? null;
                $parent = $parentId !== null ? $this->questions[$position[$parentId]] : null;
                if (! $parent || $position[$parentId] >= $link['index'] || $parent['section_name'] !== $question['section_name']) {
                    $this->warn($line, 'survey', "«subpregunta_de» apunta a «{$link['parent']}», que no existe antes en la misma sección; se importó como pregunta normal.");
                } else {
                    $question['parent_temp_id'] = $parentId;
                }
            }

            if ($link['jumps'] !== '') {
                $question['branch_rules'] = $this->parseJumps($link['jumps'], $question, $link['index'], $position);
            }

            if ($question['type'] === 'CALCULATE') {
                $question['properties']['expression'] = $this->convertExpression(
                    (string) ($question['properties']['expression'] ?? ''), $line, $link['index'], $position,
                );
            }
            unset($question);
        }
    }

    /** @return list<array{option_index:int, action:string, next_temp_id:?string}> */
    private function parseJumps(string $text, array $question, int $index, array $position): array
    {
        $line = $question['row'];
        if ($question['type'] !== 'SINGLE_CHOICE') {
            $this->warn($line, 'survey', 'Los saltos solo se aplican a preguntas de opción única; se ignoraron.');

            return [];
        }

        $options = array_map(fn ($option) => Str::lower(trim((string) $option)), $question['options'] ?? []);
        $rules = array_map(fn ($i) => ['option_index' => $i, 'action' => 'CONTINUE', 'next_temp_id' => null], array_keys($options));

        foreach (preg_split('/[;\n]+/', $text) ?: [] as $part) {
            if (trim($part) === '') {
                continue;
            }
            $pieces = preg_split('/=>|->|→/u', $part);
            if (count($pieces) !== 2) {
                $this->warn($line, 'survey', 'No se entendió el salto «'.trim($part).'» (usa «opción => destino»).');

                continue;
            }
            $optionIndex = array_search(Str::lower(trim($pieces[0])), $options, true);
            $target = trim($pieces[1]);
            if ($optionIndex === false) {
                $this->warn($line, 'survey', 'El salto menciona la opción «'.trim($pieces[0]).'», que no está en la lista.');

                continue;
            }
            if (in_array(Str::lower($target), ['fin', 'end', 'terminar'], true)) {
                $rules[$optionIndex] = ['option_index' => $optionIndex, 'action' => 'END_FORM', 'next_temp_id' => null];

                continue;
            }
            $targetId = $this->nameToTempId[$target] ?? null;
            if ($targetId === null || $position[$targetId] <= $index) {
                $this->warn($line, 'survey', "El destino «{$target}» no existe o está antes de la pregunta; el salto se ignoró.");

                continue;
            }
            $rules[$optionIndex] = ['option_index' => $optionIndex, 'action' => 'GO_TO', 'next_temp_id' => $targetId];
        }

        return $rules;
    }

    private function convertExpression(string $expression, int $line, int $index, array $position): string
    {
        $valid = true;
        $converted = preg_replace_callback('/\$\{([^}]+)\}/', function ($match) use (&$valid, $index, $position) {
            $id = $this->nameToTempId[trim($match[1])] ?? null;
            if ($id === null || $position[$id] >= $index
                || ! in_array($this->questions[$position[$id]]['type'], ['NUMBER', 'CALCULATE'], true)) {
                $valid = false;

                return $match[0];
            }

            return '${'.$id.'}';
        }, $expression) ?? $expression;

        $test = preg_replace('/\$\{[^}]+\}/', '1', $converted) ?? '';
        if (! $valid || $expression === '' || (new ArithmeticExpressionEvaluator)->evaluate($test) === null) {
            $this->warn($line, 'survey', 'El cálculo solo admite + - * / y paréntesis con números de preguntas anteriores; revisa la expresión antes de guardar.');
        }

        return $converted;
    }

    /** @return list<string>|null */
    private function optionsFor(?string $listName, int $line): ?array
    {
        if ($listName === null || $listName === '') {
            $this->error($line, 'survey', 'Falta el nombre de la lista de opciones (ej. «select_one provincias»).');

            return null;
        }
        $options = $this->choices[$listName] ?? null;
        if (! $options) {
            $this->error($line, 'survey', "La lista «{$listName}» no existe en la hoja «choices» o está vacía.");

            return null;
        }

        return array_values(array_map(fn ($choice) => $choice['label'] !== '' ? $choice['label'] : $choice['name'], $options));
    }

    /** @param list<array<string, string>> $rows */
    private function readChoices(array $rows): void
    {
        foreach ($rows as $row) {
            $list = trim($row['list_name'] ?? $row['list name'] ?? '');
            $name = trim($row['name'] ?? '');
            $label = $this->labelOf($row);
            if ($list === '' && $name === '' && $label === '') {
                continue;
            }
            if ($list === '') {
                $this->error($row['__row'], 'choices', 'Falta «list_name».');

                continue;
            }
            $this->choices[$list][] = ['name' => $name, 'label' => Str::limit($label, 500, '')];
        }
    }

    /** @param list<array<string, string>> $rows */
    private function readTitle(array $rows): ?string
    {
        $title = trim($rows[0]['form_title'] ?? '');

        return $title !== '' ? Str::limit($title, 255, '') : null;
    }

    /**
     * Filas de la hoja como arreglos asociativos por encabezado (en minúsculas).
     *
     * @return list<array<string, string>>
     */
    private function rows(Worksheet $sheet): array
    {
        $data = $sheet->toArray(null, false, false, false);
        $header = array_map(fn ($value) => Str::lower(trim((string) $value)), $data[0] ?? []);
        $rows = [];
        foreach (array_slice($data, 1, self::MAX_ROWS + 1, true) as $index => $values) {
            $row = ['__row' => $index + 1];
            foreach ($header as $column => $key) {
                if ($key !== '') {
                    $row[$key] = trim((string) ($values[$column] ?? ''));
                }
            }
            $rows[] = $row;
        }

        return $rows;
    }

    /** @param list<Worksheet> $sheets */
    private function sheet(array $sheets, string $name): ?Worksheet
    {
        foreach ($sheets as $sheet) {
            if (Str::lower(trim($sheet->getTitle())) === $name) {
                return $sheet;
            }
        }

        return null;
    }

    /** @return array{0:string, 1:?string} tipo normalizado y nombre de lista */
    private function parseType(string $raw): array
    {
        $raw = Str::lower(trim(preg_replace('/\s+/', ' ', $raw) ?? ''));
        $raw = preg_replace('/^(begin|end|select|start) (group|repeat|one|multiple)\b/', '$1_$2', $raw) ?? $raw;
        $parts = explode(' ', $raw, 2);
        $type = $parts[0] === 'datetime' || $parts[0] === 'datetime()' ? 'datetime' : $parts[0];
        if (str_ends_with($type, '_from_file')) {
            return ['unsupported_from_file', null];
        }

        return [$type, isset($parts[1]) ? trim($parts[1]) : null];
    }

    /** Texto de la columna label; si hay varias (label::Español (es)…), prefiere la de español. */
    private function labelOf(array $row): string
    {
        return $this->localized($row, 'label');
    }

    private function hintOf(array $row): string
    {
        return $this->localized($row, 'hint');
    }

    private function localized(array $row, string $column): string
    {
        if (($row[$column] ?? '') !== '') {
            return $row[$column];
        }
        $fallback = '';
        foreach ($row as $key => $value) {
            if (! is_string($key) || ! str_starts_with($key, $column.'::') || $value === '') {
                continue;
            }
            if (str_contains($key, 'es') || str_contains($key, 'espa')) {
                return $value;
            }
            $fallback = $fallback !== '' ? $fallback : $value;
        }

        return $fallback;
    }

    private function rangeEnd(string $parameters): ?int
    {
        return preg_match('/end\s*=\s*(\d+)/i', $parameters, $match) ? (int) $match[1] : null;
    }

    /** @param list<array{kind:string}> $groups */
    private function openSectionDepth(array $groups): int
    {
        return count(array_filter($groups, fn ($group) => $group['kind'] === 'group'));
    }

    private function error(int $row, string $sheet, string $message): void
    {
        $this->errors[] = ['row' => $row, 'sheet' => $sheet, 'message' => $message];
    }

    private function warn(int $row, string $sheet, string $message): void
    {
        $this->warnings[] = ['row' => $row, 'sheet' => $sheet, 'message' => $message];
    }

    /** @return array<string, mixed> */
    private function fail(string $message): array
    {
        $this->error(0, 'archivo', $message);

        return [
            'title' => null, 'sections' => [], 'questions' => [], 'errors' => $this->errors,
            'warnings' => [], 'summary' => ['sections' => 0, 'questions' => 0], 'valid' => false,
        ];
    }
}
