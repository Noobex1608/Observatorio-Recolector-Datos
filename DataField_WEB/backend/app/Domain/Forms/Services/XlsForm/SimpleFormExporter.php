<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services\XlsForm;

use App\Domain\Forms\Services\TextFormat;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Conditional;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Plantilla simple en español (y exportación en el mismo formato), pensada para llenarse sin
 * conocer XLSForm: listas desplegables, mensajes de ayuda por columna y celdas en rojo cuando falta algo.
 */
final class SimpleFormExporter
{
    private const ROWS = 400;

    private const BLUE = '0059A8';

    private const WIDTHS = ['A' => 7, 'B' => 24, 'C' => 52, 'D' => 22, 'E' => 42, 'F' => 13, 'G' => 13, 'H' => 30, 'I' => 22, 'J' => 14, 'K' => 18];

    private const PROMPTS = [
        'A' => ['N.º', 'Número de la pregunta. Se usa en los saltos (No → 5). Vacío = se numera solo.'],
        'B' => ['Sección', 'Título de la sección. Las filas con la misma sección quedan juntas.'],
        'C' => ['Pregunta', 'El texto de la pregunta. En «Fila de matriz», la afirmación.'],
        'D' => ['Tipo', 'Elija el tipo de la lista. Vea la hoja «Cómo llenarla».'],
        'E' => ['Opciones', 'Separadas por punto y coma: Sí; No; No sabe. En Matriz, la escala. En Calificación, los niveles (3 a 10).'],
        'F' => ['Obligatoria', 'Sí o No.'],
        'G' => ['Formato', 'Solo para Texto: Cédula, Correo o Teléfono (se validan).'],
        'H' => ['Ayuda', 'Texto de ayuda opcional para el encuestador.'],
        'I' => ['Si responde… ir a', 'Solo en Opción única: «No → 12» o «No → fin». Varios separados por «;».'],
        'J' => ['Subpregunta de', 'Opcional: N.º de la pregunta de la que depende.'],
        'K' => ['Cálculo', 'Solo en Cálculo: números de preguntas entre corchetes, ej. [3] + [4].'],
    ];

    public function template(): Spreadsheet
    {
        $book = new Spreadsheet;
        $this->helpSheet($book->getActiveSheet()->setTitle(SimpleFormat::HELP_SHEET));
        $this->listsSheet($book);
        $this->formatSheet($book->createSheet()->setTitle(SimpleFormat::SHEET), []);
        $this->formatSheet($book->createSheet()->setTitle(SimpleFormat::EXAMPLE_SHEET), $this->exampleRows());
        $book->setActiveSheetIndex(0);

        return $book;
    }

    /** @param iterable<object|array> $questions preguntas del formulario */
    public function export(iterable $questions): Spreadsheet
    {
        $book = new Spreadsheet;
        $this->formatSheet($book->getActiveSheet()->setTitle(SimpleFormat::SHEET), $this->rowsFor($questions));
        $this->helpSheet($book->createSheet()->setTitle(SimpleFormat::HELP_SHEET));
        $this->listsSheet($book);
        $book->setActiveSheetIndex(0);

        return $book;
    }

    /** @return list<list<string>> */
    private function rowsFor(iterable $questions): array
    {
        $questions = collect($questions)->map(fn ($question) => (object) (is_array($question) ? $question : $question->toArray()))
            ->sortBy('order')->values();
        $numbers = [];
        foreach ($questions as $index => $question) {
            $numbers[$question->id] = (string) ($index + 1);
        }

        $rows = [];
        foreach ($questions as $question) {
            $properties = is_array($question->properties ?? null) ? $question->properties : [];
            $options = $question->options ?? null;
            $number = $numbers[$question->id];
            $optionsText = '';
            if (in_array($question->type, ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'RANKING'], true) && is_array($options)) {
                $optionsText = implode('; ', array_values($options));
            } elseif ($question->type === 'LIKERT' && is_array($options)) {
                $optionsText = implode('; ', $options['columns'] ?? []);
            } elseif ($question->type === 'RATING') {
                $optionsText = (string) ($properties['max_rating'] ?? 5);
            }

            $rows[] = [
                $number,
                (string) ($question->section_name ?? ''),
                (string) $question->label,
                SimpleFormat::labelOf($question->type, $properties['allowed_media'] ?? null),
                $optionsText,
                in_array($question->type, ['NOTE', 'CALCULATE'], true) ? '' : (! empty($question->required) ? 'Sí' : 'No'),
                (string) (array_search(TextFormat::of($properties), SimpleFormat::FORMATS, true) ?: ''),
                (string) ($properties['help_text'] ?? ''),
                $this->jumps($question, $numbers),
                ! empty($question->parent_question_id) ? ($numbers[$question->parent_question_id] ?? '') : '',
                $question->type === 'CALCULATE'
                    ? (preg_replace_callback('/\$\{([^}]+)\}/', fn ($m) => '['.($numbers[$m[1]] ?? '?').']', (string) ($properties['expression'] ?? '')) ?? '')
                    : '',
            ];

            if ($question->type === 'LIKERT' && is_array($options)) {
                foreach ($options['rows'] ?? [] as $statement) {
                    $rows[] = ['', (string) ($question->section_name ?? ''), '↳ '.$statement, SimpleFormat::MATRIX_ROW, '', '', '', '', '', '', ''];
                }
            }
        }

        return $rows;
    }

    private function jumps(object $question, array $numbers): string
    {
        $options = is_array($question->options ?? null) && array_is_list($question->options) ? $question->options : [];
        $parts = [];
        foreach ($question->branch_rules ?? [] as $rule) {
            $label = $options[$rule['option_index'] ?? -1] ?? null;
            $action = $rule['action'] ?? 'CONTINUE';
            if ($label === null || $action === 'CONTINUE') {
                continue;
            }
            $target = $action === 'END_FORM' ? 'fin' : ($numbers[$rule['next_question_id'] ?? ''] ?? null);
            if ($target !== null) {
                $parts[] = "{$label} → {$target}";
            }
        }

        return implode('; ', $parts);
    }

    /** @return list<list<string>> */
    private function exampleRows(): array
    {
        $s1 = 'Datos del encuestado';
        $s2 = 'Opinión';

        return [
            ['1', $s1, 'Nombre completo', 'Texto', '', 'Sí', '', '', '', '', ''],
            ['2', $s1, 'Número de cédula', 'Texto', '', 'Sí', 'Cédula', '', '', '', ''],
            ['3', $s1, 'Correo electrónico', 'Texto', '', 'No', 'Correo', '', '', '', ''],
            ['4', $s1, 'Edad (años cumplidos)', 'Número', '', 'Sí', '', '', '', '', ''],
            ['5', $s1, 'Sexo', 'Opción única', 'Hombre; Mujer; Prefiere no decir', 'Sí', '', '', '', '', ''],
            ['6', $s1, '¿Trabaja actualmente?', 'Opción única', 'Sí; No', 'Sí', '', '', 'No → 8', '', ''],
            ['7', $s1, '¿En qué trabaja?', 'Texto', '', 'No', '', '', '', '6', ''],
            ['8', $s2, '¿Qué tan de acuerdo está con lo siguiente?', 'Matriz', implode('; ', SimpleFormat::DEFAULT_SCALE), 'Sí', '', '', '', '', ''],
            ['', $s2, '↳ Los servicios públicos funcionan bien', SimpleFormat::MATRIX_ROW, '', '', '', '', '', '', ''],
            ['', $s2, '↳ Me siento seguro en mi barrio', SimpleFormat::MATRIX_ROW, '', '', '', '', '', '', ''],
            ['9', $s2, '¿Por qué medios se informa?', 'Opción múltiple', 'Televisión; Radio; Redes sociales; Prensa escrita', 'No', '', 'Marque todas las que apliquen', '', '', ''],
            ['10', $s2, 'Califique la atención recibida', 'Calificación', '5', 'No', '', '', '', '', ''],
            ['11', $s2, 'Gracias por su tiempo.', 'Nota', '', '', '', '', '', '', ''],
        ];
    }

    /** @param list<list<string>> $rows */
    private function formatSheet(Worksheet $sheet, array $rows): void
    {
        $sheet->fromArray([array_values(SimpleFormat::COLUMNS), ...$rows], null, 'A1', true);
        $last = self::ROWS + 1;

        $header = $sheet->getStyle('A1:K1');
        $header->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $header->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB(self::BLUE);
        $header->getAlignment()->setVertical(Alignment::VERTICAL_CENTER)->setWrapText(true);
        $sheet->getRowDimension(1)->setRowHeight(32);
        // Columnas avanzadas con encabezado más claro
        $sheet->getStyle('I1:K1')->getFill()->getStartColor()->setRGB('3D7CC0');

        foreach (self::WIDTHS as $column => $width) {
            $sheet->getColumnDimension($column)->setWidth($width);
        }
        $sheet->getStyle("A2:K{$last}")->getAlignment()->setVertical(Alignment::VERTICAL_TOP);
        foreach (['B', 'C', 'E', 'H', 'I'] as $column) {
            $sheet->getStyle("{$column}2:{$column}{$last}")->getAlignment()->setWrapText(true);
        }
        $sheet->getStyle("A2:K{$last}")->getBorders()->getAllBorders()
            ->setBorderStyle(Border::BORDER_THIN)->getColor()->setRGB('D9E2EC');
        foreach (['A', 'F', 'G'] as $column) {
            $sheet->getStyle("{$column}2:{$column}{$last}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        }
        $sheet->freezePane('A2');
        $sheet->setAutoFilter('A1:K1');

        // Mensajes de ayuda al seleccionar cada columna y listas desplegables
        foreach (self::PROMPTS as $column => [$title, $prompt]) {
            $validation = new DataValidation;
            $validation->setShowInputMessage(true)->setPromptTitle($title)->setPrompt($prompt)->setAllowBlank(true);
            $list = ['D' => '$A$2:$A$'.(count(SimpleFormat::TYPES) + 1), 'F' => '$B$2:$B$3', 'G' => '$C$2:$C$4'][$column] ?? null;
            if ($list !== null) {
                $validation->setType(DataValidation::TYPE_LIST)->setShowDropDown(true)
                    ->setShowErrorMessage(true)->setErrorStyle(DataValidation::STYLE_STOP)
                    ->setErrorTitle('Valor no válido')->setError('Elija un valor de la lista desplegable.')
                    ->setFormula1("'".SimpleFormat::LISTS_SHEET."'!".$list);
            }
            $sheet->setDataValidation("{$column}2:{$column}{$last}", $validation);
        }

        // Celdas en rojo cuando falta algo
        $this->highlight($sheet, "C2:C{$last}", 'AND($D2<>"",TRIM($C2)="",$D2<>"Cálculo")');
        $this->highlight($sheet, "D2:D{$last}", 'AND(TRIM($C2)<>"",$D2="")');
        $this->highlight($sheet, "E2:E{$last}", 'AND(OR($D2="Opción única",$D2="Opción múltiple",$D2="Ordenar"),TRIM($E2)="")');
        $this->highlight($sheet, "K2:K{$last}", 'AND($D2="Cálculo",TRIM($K2)="")');
        $this->highlight($sheet, "G2:G{$last}", 'AND($G2<>"",$D2<>"Texto")');
    }

    private function highlight(Worksheet $sheet, string $range, string $formula): void
    {
        $rule = new Conditional;
        $rule->setConditionType(Conditional::CONDITION_EXPRESSION)->addCondition($formula);
        $rule->getStyle()->getFill()->setFillType(Fill::FILL_SOLID)->getEndColor()->setRGB('FDE2E1');
        $rule->getStyle()->getFill()->getStartColor()->setRGB('FDE2E1');
        foreach (['getLeft', 'getRight', 'getTop', 'getBottom'] as $side) {
            $rule->getStyle()->getBorders()->{$side}()->setBorderStyle(Border::BORDER_THIN)->getColor()->setRGB('C8102E');
        }
        $conditionals = $sheet->getStyle($range)->getConditionalStyles();
        $conditionals[] = $rule;
        $sheet->getStyle($range)->setConditionalStyles($conditionals);
    }

    private function listsSheet(Spreadsheet $book): void
    {
        $lists = $book->createSheet()->setTitle(SimpleFormat::LISTS_SHEET);
        $lists->setCellValue('A1', 'Tipos')->setCellValue('B1', 'Obligatoria')->setCellValue('C1', 'Formato');
        $lists->fromArray(array_map(fn ($type) => [$type], array_keys(SimpleFormat::TYPES)), null, 'A2', true);
        $lists->fromArray([['Sí'], ['No']], null, 'B2', true);
        $lists->fromArray(array_map(fn ($format) => [$format], array_keys(SimpleFormat::FORMATS)), null, 'C2', true);
        $lists->setSheetState(Worksheet::SHEETSTATE_HIDDEN);
    }

    private function helpSheet(Worksheet $sheet): void
    {
        $steps = [
            ['Cómo crear una encuesta en Excel'],
            [''],
            ['1. Escriba sus preguntas en la hoja «Mi encuesta», una por fila. La hoja «Ejemplo» muestra cómo queda (no se importa).'],
            ['2. Elija el «Tipo» de la lista desplegable. Si es Opción única u Opción múltiple, escriba las «Opciones» separadas por punto y coma: Sí; No; No sabe'],
            ['3. Escriba la «Sección» de cada pregunta: las filas con la misma sección quedan juntas en la encuesta.'],
            ['4. Las celdas se marcan en rojo cuando falta algo (por ejemplo, una pregunta de opciones sin opciones).'],
            ['5. En el sistema, abra el formulario y use «Importar desde Excel». Verá una vista previa antes de cargar nada.'],
            [''],
            ['Tipos de pregunta'],
            ['Tipo', 'Para qué sirve', 'Qué escribir en «Opciones»'],
        ];
        foreach (SimpleFormat::TYPES as $name => [, , $purpose, $options]) {
            $steps[] = [$name, $purpose, $options];
        }
        $steps = [...$steps,
            [''],
            ['Columnas opcionales'],
            ['Formato', 'Solo en Texto: Cédula, Correo o Teléfono. La respuesta se valida al encuestar.'],
            ['Si responde… ir a', 'Solo en Opción única: «No → 12» salta a la pregunta 12; «No → fin» termina la encuesta. Varios separados por «;».'],
            ['Subpregunta de', 'N.º de la pregunta de la que depende (debe estar antes y en la misma sección).'],
            ['Cálculo', 'Solo en tipo Cálculo: + - * / con números de preguntas anteriores entre corchetes, ej. [3] + [4].'],
            [''],
            ['Matriz (escala Likert): escriba una fila de tipo «Matriz» con la pregunta y la escala en «Opciones»; debajo, una fila «Fila de matriz» por cada afirmación.'],
        ];
        $sheet->fromArray($steps, null, 'A1', true);
        $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(15)->getColor()->setRGB(self::BLUE);
        foreach (['A9', 'A'.(count(SimpleFormat::TYPES) + 12)] as $cell) {
            $sheet->getStyle($cell)->getFont()->setBold(true)->setSize(12)->getColor()->setRGB(self::BLUE);
        }
        $table = $sheet->getStyle('A10:C10');
        $table->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $table->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB(self::BLUE);
        $sheet->getStyle('A11:A'.(10 + count(SimpleFormat::TYPES)))->getFont()->setBold(true);
        $sheet->getColumnDimension('A')->setWidth(26);
        $sheet->getColumnDimension('B')->setWidth(70);
        $sheet->getColumnDimension('C')->setWidth(60);
        $sheet->getStyle('A1:C60')->getAlignment()->setWrapText(true)->setVertical(Alignment::VERTICAL_TOP);
        foreach ([1, 3, 4, 5, 6, 7, count($steps)] as $row) {
            $sheet->mergeCells("A{$row}:C{$row}");
        }
    }
}
