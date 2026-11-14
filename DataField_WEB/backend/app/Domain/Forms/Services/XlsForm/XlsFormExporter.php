<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services\XlsForm;

use App\Domain\Forms\Services\TextFormat;
use Illuminate\Support\Collection;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Genera el cuestionario en formato XLSForm (hojas survey, choices y settings), compatible con
 * KoboToolbox / ODK y con la importación del propio sistema (incluye las columnas formato,
 * saltos y subpregunta_de).
 */
final class XlsFormExporter
{
    public const SURVEY_COLUMNS = [
        'type', 'name', 'label', 'hint', 'required', 'appearance', 'calculation', 'parameters',
        'formato', 'saltos', 'subpregunta_de',
    ];

    /** Tipos sugeridos en la lista desplegable de la plantilla (se puede escribir cualquier otro). */
    private const TYPE_SUGGESTIONS = [
        'begin_group', 'end_group', 'select_one', 'select_multiple', 'text', 'integer', 'decimal',
        'note', 'date', 'time', 'datetime', 'geopoint', 'image', 'audio', 'video', 'rank', 'range',
        'barcode', 'calculate',
    ];

    /**
     * @param  Collection<int, object>|iterable<object|array>  $questions  preguntas ordenadas (FormQuestion o arreglos)
     */
    public function export(string $title, iterable $questions): Spreadsheet
    {
        $questions = collect($questions)->map(fn ($question) => (object) (is_array($question) ? $question : $question->toArray()))
            ->sortBy('order')->values();

        $names = [];
        foreach ($questions as $index => $question) {
            $names[$question->id] = 'p'.($index + 1);
        }

        $survey = [];
        $choices = [];
        $currentSection = null;
        $sectionCount = 0;

        foreach ($questions as $question) {
            $section = $question->section_name ?: null;
            if ($section !== $currentSection) {
                if ($currentSection !== null) {
                    $survey[] = ['type' => 'end_group'];
                }
                if ($section !== null) {
                    $sectionCount++;
                    $survey[] = ['type' => 'begin_group', 'name' => 'seccion_'.$sectionCount, 'label' => $section];
                }
                $currentSection = $section;
            }

            $name = $names[$question->id];
            $properties = is_array($question->properties ?? null) ? $question->properties : [];
            $options = $question->options ?? null;
            $base = [
                'name' => $name,
                'label' => $question->label,
                'hint' => $properties['help_text'] ?? '',
                'required' => ! empty($question->required) ? 'yes' : '',
                'subpregunta_de' => ! empty($question->parent_question_id) ? ($names[$question->parent_question_id] ?? '') : '',
            ];

            switch ($question->type) {
                case 'LIKERT':
                    $rows = is_array($options) ? array_values($options['rows'] ?? []) : [];
                    $columns = is_array($options) ? array_values($options['columns'] ?? []) : [];
                    $list = $name.'_escala';
                    $survey[] = ['type' => 'begin_group', 'name' => $name, 'label' => $question->label, 'appearance' => 'table-list'];
                    foreach ($rows as $i => $row) {
                        $survey[] = [
                            'type' => 'select_one '.$list, 'name' => $name.'_'.($i + 1), 'label' => $row,
                            'required' => $base['required'],
                        ];
                    }
                    $survey[] = ['type' => 'end_group'];
                    $this->addChoices($choices, $list, $columns);
                    break;
                case 'SINGLE_CHOICE':
                case 'MULTIPLE_CHOICE':
                case 'RANKING':
                    $list = $name.'_opciones';
                    $keyword = ['SINGLE_CHOICE' => 'select_one', 'MULTIPLE_CHOICE' => 'select_multiple', 'RANKING' => 'rank'][$question->type];
                    $survey[] = array_merge($base, ['type' => $keyword.' '.$list, 'saltos' => $this->jumps($question, $names)]);
                    $this->addChoices($choices, $list, is_array($options) ? array_values($options) : []);
                    break;
                case 'TEXT':
                    $survey[] = array_merge($base, ['type' => 'text', 'formato' => TextFormat::of($properties) ?? '']);
                    break;
                case 'CALCULATE':
                    $survey[] = array_merge($base, [
                        'type' => 'calculate', 'required' => '',
                        'calculation' => $this->namedExpression((string) ($properties['expression'] ?? ''), $names),
                    ]);
                    break;
                case 'RATING':
                    $survey[] = array_merge($base, ['type' => 'range', 'parameters' => 'start=1 end='.((int) ($properties['max_rating'] ?? 5)).' step=1']);
                    break;
                case 'SIGNATURE':
                    $survey[] = array_merge($base, ['type' => 'image', 'appearance' => 'signature']);
                    break;
                case 'MULTIMEDIA':
                    $media = $properties['allowed_media'] ?? 'all';
                    $survey[] = array_merge($base, ['type' => in_array($media, ['image', 'audio', 'video'], true) ? $media : 'file']);
                    break;
                case 'NOTE':
                    $survey[] = array_merge($base, ['type' => 'note', 'required' => '']);
                    break;
                default:
                    $survey[] = array_merge($base, ['type' => [
                        'NUMBER' => 'decimal', 'DATE' => 'date', 'TIME' => 'time', 'DATETIME' => 'datetime',
                        'GPS' => 'geopoint', 'BARCODE' => 'barcode',
                    ][$question->type] ?? 'text']);
            }
        }
        if ($currentSection !== null) {
            $survey[] = ['type' => 'end_group'];
        }

        return $this->build($title, $survey, $choices, false);
    }

    /** Plantilla con ejemplos de cada tipo e instrucciones. */
    public function template(): Spreadsheet
    {
        $survey = [
            ['type' => 'begin_group', 'name' => 'datos', 'label' => 'Datos del encuestado'],
            ['type' => 'text', 'name' => 'nombre', 'label' => 'Nombre completo', 'required' => 'yes'],
            ['type' => 'text', 'name' => 'cedula', 'label' => 'Número de cédula', 'required' => 'yes', 'formato' => 'cedula_ec'],
            ['type' => 'text', 'name' => 'correo', 'label' => 'Correo electrónico', 'formato' => 'email'],
            ['type' => 'integer', 'name' => 'edad', 'label' => 'Edad (años cumplidos)', 'required' => 'yes'],
            ['type' => 'select_one sexo', 'name' => 'sexo', 'label' => 'Sexo', 'required' => 'yes'],
            ['type' => 'select_one si_no', 'name' => 'trabaja', 'label' => '¿Trabaja actualmente?', 'required' => 'yes', 'saltos' => 'No => satisfaccion'],
            ['type' => 'text', 'name' => 'ocupacion', 'label' => '¿En qué trabaja?'],
            ['type' => 'end_group'],
            ['type' => 'begin_group', 'name' => 'opinion', 'label' => 'Opinión'],
            ['type' => 'begin_group', 'name' => 'satisfaccion', 'label' => '¿Qué tan de acuerdo está con…?', 'appearance' => 'table-list'],
            ['type' => 'select_one acuerdo', 'name' => 'sat_1', 'label' => 'Los servicios públicos funcionan bien', 'required' => 'yes'],
            ['type' => 'select_one acuerdo', 'name' => 'sat_2', 'label' => 'Me siento seguro en mi barrio', 'required' => 'yes'],
            ['type' => 'end_group'],
            ['type' => 'select_multiple medios', 'name' => 'medios', 'label' => '¿Por qué medios se informa?', 'hint' => 'Marque todas las que apliquen'],
            ['type' => 'note', 'name' => 'gracias', 'label' => 'Gracias por su tiempo.'],
            ['type' => 'end_group'],
        ];
        $choices = [];
        $this->addChoices($choices, 'sexo', ['Hombre', 'Mujer', 'Prefiere no decir']);
        $this->addChoices($choices, 'si_no', ['Sí', 'No']);
        $this->addChoices($choices, 'acuerdo', ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']);
        $this->addChoices($choices, 'medios', ['Televisión', 'Radio', 'Redes sociales', 'Prensa escrita']);

        return $this->build('Mi encuesta', $survey, $choices, true);
    }

    /**
     * @param  list<array<string, string>>  $survey
     * @param  list<array<string, string>>  $choices
     */
    private function build(string $title, array $survey, array $choices, bool $withInstructions): Spreadsheet
    {
        $book = new Spreadsheet;
        $surveySheet = $book->getActiveSheet()->setTitle('survey');
        $this->table($surveySheet, self::SURVEY_COLUMNS, $survey, [16 => 'A', 14 => 'B', 60 => 'C', 36 => 'D', 10 => 'E']);
        $this->addTypeDropdown($surveySheet, max(200, count($survey) + 50));

        $choicesSheet = $book->createSheet()->setTitle('choices');
        $this->table($choicesSheet, ['list_name', 'name', 'label'], $choices, [22 => 'A', 18 => 'B', 50 => 'C']);

        $settings = $book->createSheet()->setTitle('settings');
        $this->table($settings, ['form_title', 'default_language'], [['form_title' => $title, 'default_language' => 'Español (es)']], [50 => 'A', 20 => 'B']);

        if ($withInstructions) {
            $help = $book->createSheet()->setTitle('instrucciones');
            $lines = [
                ['Cómo llenar la plantilla (formato XLSForm, compatible con KoboToolbox / ODK)'],
                [''],
                ['Hoja survey: una fila por pregunta. Hoja choices: las opciones de cada lista. Hoja settings: el título.'],
                ['type: tipo de pregunta. Para opciones escriba el tipo y el nombre de la lista: «select_one si_no».'],
                ['name: identificador único sin espacios ni tildes (ej. edad, p12). Se usa en saltos y cálculos.'],
                ['label: el texto de la pregunta.  hint: ayuda opcional.  required: «yes» si es obligatoria.'],
                ['begin_group / end_group: abren y cierran una sección; el label del begin_group es el título de la sección.'],
                ['Matriz Likert: un grupo con appearance «table-list» cuyas filas son select_one de la misma lista.'],
                [''],
                ['Tipos: text, integer, decimal, select_one, select_multiple, rank, date, time, datetime, geopoint,'],
                ['image (con appearance «signature» es una firma), audio, video, file, note, range (escala 3 a 10), barcode, calculate.'],
                [''],
                ['Columnas propias del sistema (Kobo las ignora):'],
                ['formato: en preguntas text valida email, cedula_ec o telefono_ec.'],
                ['saltos: en select_one, «opción => name_destino» separados por «;». Use «fin» para terminar la encuesta.'],
                ['subpregunta_de: name de la pregunta padre (debe estar antes, en la misma sección).'],
                ['calculation: solo + - * / y paréntesis con ${name} de preguntas numéricas anteriores.'],
                [''],
                ['No se importan: relevant, constraint, grupos repetibles, geotrace / geoshape ni listas desde archivo.'],
            ];
            $help->fromArray($lines, null, 'A1');
            $help->getStyle('A1')->getFont()->setBold(true)->setSize(13);
            $help->getColumnDimension('A')->setWidth(120);
        }

        $book->setActiveSheetIndex(0);

        return $book;
    }

    /**
     * @param  list<string>  $columns
     * @param  list<array<string, string>>  $rows
     * @param  array<int, string>  $widths  ancho => columna
     */
    private function table(Worksheet $sheet, array $columns, array $rows, array $widths): void
    {
        $data = [$columns];
        foreach ($rows as $row) {
            $data[] = array_map(fn ($column) => (string) ($row[$column] ?? ''), $columns);
        }
        $sheet->fromArray($data, null, 'A1', true);
        $last = $sheet->getHighestColumn();
        $sheet->getStyle("A1:{$last}1")->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle("A1:{$last}1")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('0059A8');
        $sheet->freezePane('A2');
        foreach ($widths as $width => $column) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }
        foreach (range('A', $last) as $column) {
            if (! in_array($column, $widths, true)) {
                $sheet->getColumnDimension($column)->setWidth(18);
            }
        }
    }

    private function addTypeDropdown(Worksheet $sheet, int $rows): void
    {
        $validation = new DataValidation;
        $validation->setType(DataValidation::TYPE_LIST)
            ->setErrorStyle(DataValidation::STYLE_INFORMATION)
            ->setAllowBlank(true)
            ->setShowDropDown(true)
            ->setShowErrorMessage(false)
            ->setShowInputMessage(true)
            ->setPromptTitle('Tipo de pregunta')
            ->setPrompt('Elija un tipo. Para listas escriba además su nombre: select_one si_no')
            ->setFormula1('"'.implode(',', self::TYPE_SUGGESTIONS).'"');
        $sheet->setDataValidation("A2:A{$rows}", $validation);
    }

    /** @param list<array<string, string>> $choices */
    private function addChoices(array &$choices, string $list, array $labels): void
    {
        foreach (array_values($labels) as $i => $label) {
            $choices[] = ['list_name' => $list, 'name' => 'op'.($i + 1), 'label' => (string) $label];
        }
    }

    private function jumps(object $question, array $names): string
    {
        $options = is_array($question->options ?? null) ? array_values($question->options) : [];
        $parts = [];
        foreach ($question->branch_rules ?? [] as $rule) {
            $label = $options[$rule['option_index'] ?? -1] ?? null;
            $action = $rule['action'] ?? 'CONTINUE';
            if ($label === null || $action === 'CONTINUE') {
                continue;
            }
            $target = $action === 'END_FORM' ? 'fin' : ($names[$rule['next_question_id'] ?? ''] ?? null);
            if ($target !== null) {
                $parts[] = "{$label} => {$target}";
            }
        }

        return implode('; ', $parts);
    }

    private function namedExpression(string $expression, array $names): string
    {
        return preg_replace_callback('/\$\{([^}]+)\}/', fn ($m) => '${'.($names[$m[1]] ?? $m[1]).'}', $expression) ?? $expression;
    }
}
