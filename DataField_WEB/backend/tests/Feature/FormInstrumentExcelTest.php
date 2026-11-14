<?php

namespace Tests\Feature;

use App\Domain\Forms\Services\XlsForm\SimpleFormExporter;
use App\Domain\Forms\Services\XlsForm\XlsFormExporter;
use App\Models\Form;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

/** Cuestionarios en Excel (XLSForm): plantilla, vista previa de importación y exportación de ida y vuelta. */
class FormInstrumentExcelTest extends TestCase
{
    use RefreshDatabase;

    private User $leader;

    protected function setUp(): void
    {
        parent::setUp();
        $this->leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        Sanctum::actingAs($this->leader);
    }

    private function upload(Spreadsheet $book): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'xls').'.xlsx';
        (new Xlsx($book))->save($path);
        $book->disconnectWorksheets();

        return new UploadedFile($path, 'encuesta.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);
    }

    /** @param list<list<string>> $survey  @param list<list<string>> $choices */
    private function book(array $survey, array $choices = []): Spreadsheet
    {
        $book = new Spreadsheet;
        $book->getActiveSheet()->setTitle('survey')->fromArray($survey, null, 'A1', true);
        $book->createSheet()->setTitle('choices')->fromArray([['list_name', 'name', 'label'], ...$choices], null, 'A1', true);

        return $book;
    }

    public function test_the_template_imports_cleanly_with_sections_likert_formats_and_jumps(): void
    {
        $preview = $this->postJson('/api/forms/import/preview', [
            'file' => $this->upload((new XlsFormExporter)->template()),
        ])->assertOk()->json();

        $this->assertTrue($preview['valid'], json_encode($preview['errors']));
        $this->assertSame(['Datos del encuestado', 'Opinión'], $preview['sections']);
        $this->assertSame('Mi encuesta', $preview['title']);
        $types = array_column($preview['questions'], 'type');
        $this->assertSame(['TEXT', 'TEXT', 'TEXT', 'NUMBER', 'SINGLE_CHOICE', 'SINGLE_CHOICE', 'TEXT', 'LIKERT', 'MULTIPLE_CHOICE', 'NOTE'], $types);

        $byName = collect($preview['questions'])->keyBy('name');
        $this->assertSame('cedula_ec', $byName['cedula']['properties']['text_format']);
        $this->assertSame(['rows' => ['Los servicios públicos funcionan bien', 'Me siento seguro en mi barrio'],
            'columns' => ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo']],
            $byName['satisfaccion']['options']);
        $this->assertSame('Opinión', $byName['satisfaccion']['section_name']);
        // «No => satisfaccion» salta a la matriz Likert
        $jump = collect($byName['trabaja']['branch_rules'])->firstWhere('action', 'GO_TO');
        $this->assertSame(1, $jump['option_index']);
        $this->assertSame($byName['satisfaccion']['temp_id'], $jump['next_temp_id']);
        $this->assertTrue($byName['nombre']['required']);
        $this->assertFalse($byName['correo']['required']);
    }

    public function test_errors_point_to_the_row_and_unsupported_features_become_warnings(): void
    {
        $preview = $this->postJson('/api/forms/import/preview', ['file' => $this->upload($this->book([
            ['type', 'name', 'label', 'relevant'],
            ['start', 'start', '', ''],
            ['select_one colores', 'color', 'Color favorito', ''],
            ['text', 'motivo', '¿Por qué?', "\${color} = 'rojo'"],
            ['geoshape', 'area', 'Área', ''],
            ['integer', 'motivo', 'Duplicada', ''],
        ]))])->assertOk()->json();

        $this->assertFalse($preview['valid']);
        $errors = collect($preview['errors'])->map(fn ($e) => $e['row'].': '.$e['message'])->all();
        $this->assertContains('3: La lista «colores» no existe en la hoja «choices» o está vacía.', $errors);
        $this->assertContains('6: El nombre «motivo» está repetido.', $errors);
        $warnings = collect($preview['warnings'])->pluck('message')->implode(' | ');
        $this->assertStringContainsString('relevant', $warnings);
        $this->assertStringContainsString('geoshape', $warnings);
        $this->assertStringContainsString('metadatos', $warnings);
    }

    public function test_calculations_reference_previous_numbers_by_name(): void
    {
        $preview = $this->postJson('/api/forms/import/preview', ['file' => $this->upload($this->book([
            ['type', 'name', 'label', 'calculation'],
            ['integer', 'hombres', 'Hombres en el hogar', ''],
            ['integer', 'mujeres', 'Mujeres en el hogar', ''],
            ['calculate', 'total', '', '${hombres} + ${mujeres}'],
        ]))])->assertOk()->json();

        $this->assertTrue($preview['valid']);
        [$h, $m, $total] = $preview['questions'];
        $this->assertSame('${'.$h['temp_id'].'} + ${'.$m['temp_id'].'}', $total['properties']['expression']);
        $this->assertSame([], $preview['warnings']);
    }

    private function sampleForm(): Form
    {
        $project = Project::create(['name' => 'Excel', 'created_by' => $this->leader->id]);
        $project->leaders()->attach($this->leader->id);
        $form = Form::create([
            'title' => 'Hogares 2026', 'user_id' => $this->leader->id, 'project_id' => $project->id,
            'state' => 'DRAFT', 'link_uuid' => (string) Str::uuid(), 'consent_text' => 'Acepto participar en la encuesta.',
        ]);
        $make = fn (array $data) => $form->questions()->create($data + ['required' => true, 'section_name' => 'Hogar']);
        $q1 = $make(['type' => 'SINGLE_CHOICE', 'label' => '¿Tiene hijos?', 'order' => 0, 'options' => ['Sí', 'No']]);
        $q2 = $make(['type' => 'NUMBER', 'label' => '¿Cuántos?', 'order' => 1, 'parent_question_id' => $q1->id]);
        $q3 = $make(['type' => 'LIKERT', 'label' => 'Satisfacción', 'order' => 2, 'section_name' => 'Opinión',
            'options' => ['rows' => ['Salud', 'Educación'], 'columns' => ['Malo', 'Regular', 'Bueno']]]);
        $q1->update(['branch_rules' => [
            ['option_index' => 0, 'action' => 'CONTINUE', 'next_question_id' => null],
            ['option_index' => 1, 'action' => 'GO_TO', 'next_question_id' => $q3->id],
        ]]);
        $make(['type' => 'CALCULATE', 'label' => 'Doble', 'order' => 3, 'section_name' => 'Opinión', 'required' => false,
            'properties' => ['expression' => '${'.$q2->id.'} * 2']]);

        return $form;
    }

    public function test_export_and_reimport_keep_the_questionnaire(): void
    {
        $form = $this->sampleForm();
        $download = $this->get("/api/forms/{$form->id}/instrument.xlsx?formato=xlsform")->assertOk();
        $path = tempnam(sys_get_temp_dir(), 'exp').'.xlsx';
        file_put_contents($path, $download->streamedContent());

        $preview = $this->postJson('/api/forms/import/preview', [
            'file' => new UploadedFile($path, 'hogares.xlsx', null, null, true),
        ])->assertOk()->json();

        $this->assertTrue($preview['valid'], json_encode($preview['errors']));
        $this->assertSame('Hogares 2026', $preview['title']);
        $this->assertSame(['Hogar', 'Opinión'], $preview['sections']);
        [$i1, $i2, $i3, $i4] = $preview['questions'];
        $this->assertSame(['SINGLE_CHOICE', 'NUMBER', 'LIKERT', 'CALCULATE'], [$i1['type'], $i2['type'], $i3['type'], $i4['type']]);
        $this->assertSame($i1['temp_id'], $i2['parent_temp_id']);
        $this->assertSame(['option_index' => 1, 'action' => 'GO_TO', 'next_temp_id' => $i3['temp_id']], $i1['branch_rules'][1]);
        $this->assertSame(['rows' => ['Salud', 'Educación'], 'columns' => ['Malo', 'Regular', 'Bueno']], $i3['options']);
        $this->assertSame('${'.$i2['temp_id'].'} * 2', $i4['properties']['expression']);
    }

    public function test_collectors_cannot_use_the_import(): void
    {
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_USER]));
        $this->get('/api/forms/import/template')->assertForbidden();
    }

    public function test_files_that_are_not_excel_are_rejected(): void
    {
        $this->postJson('/api/forms/import/preview', [
            'file' => UploadedFile::fake()->create('encuesta.pdf', 10, 'application/pdf'),
        ])->assertStatus(422)->assertJsonValidationErrors('file');
    }

    /** @param list<list<string>> $rows */
    private function simpleBook(array $rows): Spreadsheet
    {
        $book = new Spreadsheet;
        $book->getActiveSheet()->setTitle('Mi encuesta')->fromArray([
            ['N.º', 'Sección', 'Pregunta', 'Tipo', 'Opciones', 'Obligatoria', 'Formato', 'Ayuda', 'Si responde… ir a', 'Subpregunta de (N.º)', 'Cálculo'],
            ...$rows,
        ], null, 'A1', true);

        return $book;
    }

    public function test_the_simple_template_example_imports_cleanly(): void
    {
        $book = (new SimpleFormExporter)->template();
        // El usuario copia el ejemplo a «Mi encuesta»
        $example = $book->getSheetByName('Ejemplo')->toArray(null, false, false, false);
        $book->getSheetByName('Mi encuesta')->fromArray($example, null, 'A1', true);

        $preview = $this->postJson('/api/forms/import/preview', ['file' => $this->upload($book)])->assertOk()->json();

        $this->assertTrue($preview['valid'], json_encode($preview['errors']));
        $this->assertSame([], $preview['warnings']);
        $this->assertSame(['Datos del encuestado', 'Opinión'], $preview['sections']);
        $q = collect($preview['questions'])->keyBy('name');
        $this->assertSame('cedula_ec', $q['2']['properties']['text_format']);
        $this->assertSame(['Hombre', 'Mujer', 'Prefiere no decir'], $q['5']['options']);
        $this->assertSame(['option_index' => 1, 'action' => 'GO_TO', 'next_temp_id' => $q['8']['temp_id']], $q['6']['branch_rules'][1]);
        $this->assertSame($q['6']['temp_id'], $q['7']['parent_temp_id']);
        $this->assertSame('LIKERT', $q['8']['type']);
        $this->assertSame(['Los servicios públicos funcionan bien', 'Me siento seguro en mi barrio'], $q['8']['options']['rows']);
        $this->assertSame(5, $q['10']['properties']['max_rating']);
        $this->assertSame('NOTE', $q['11']['type']);
        $this->assertTrue($q['1']['required']);
        $this->assertFalse($q['3']['required']);
    }

    public function test_the_empty_simple_template_explains_where_to_write(): void
    {
        $preview = $this->postJson('/api/forms/import/preview', [
            'file' => $this->upload((new SimpleFormExporter)->template()),
        ])->assertOk()->json();

        $this->assertFalse($preview['valid']);
        $this->assertStringContainsString('no tiene preguntas', $preview['errors'][0]['message']);
    }

    public function test_simple_format_errors_and_warnings_point_to_rows(): void
    {
        $preview = $this->postJson('/api/forms/import/preview', ['file' => $this->upload($this->simpleBook([
            ['', 'A', '¿Color favorito?', 'Opción única', '', 'Sí'],
            ['', 'A', 'Algo', 'Desconocido'],
            ['', 'A', '↳ Huérfana', 'Fila de matriz'],
            ['', 'A', 'Edad', 'Número', '', 'Tal vez', 'Cédula'],
            ['', 'A', '¿Trabaja?', 'opcion unica', 'Sí; No', 'si', '', '', 'Quizás → 2; No → 99'],
        ]))])->assertOk()->json();

        $errors = collect($preview['errors'])->map(fn ($e) => $e['row'].': '.$e['message'])->all();
        $this->assertContains('2: Escribe las «Opciones» separadas por punto y coma (ej. Sí; No).', $errors);
        $this->assertContains('3: El tipo «Desconocido» no existe. Elígelo de la lista desplegable.', $errors);
        $this->assertContains('4: «Fila de matriz» debe ir debajo de una fila de tipo «Matriz».', $errors);
        $warnings = collect($preview['warnings'])->map(fn ($e) => $e['row'].': '.$e['message'])->implode(' | ');
        $this->assertStringContainsString('5: «Formato» solo se aplica', $warnings);
        $this->assertStringContainsString('5: «Obligatoria» debe ser Sí o No', $warnings);
        $this->assertStringContainsString('6: El salto menciona la opción «Quizás»', $warnings);
        $this->assertStringContainsString('6: El salto va a la pregunta «99»', $warnings);
        $trabaja = collect($preview['questions'])->firstWhere('label', '¿Trabaja?');
        $this->assertSame('SINGLE_CHOICE', $trabaja['type']);
        $this->assertTrue($trabaja['required']);
    }

    public function test_simple_export_and_reimport_keep_the_questionnaire(): void
    {
        $form = $this->sampleForm();
        $download = $this->get("/api/forms/{$form->id}/instrument.xlsx")->assertOk();
        $this->assertStringContainsString('hogares-2026.xlsx', $download->headers->get('content-disposition'));
        $path = tempnam(sys_get_temp_dir(), 'simple').'.xlsx';
        file_put_contents($path, $download->streamedContent());

        $preview = $this->postJson('/api/forms/import/preview', [
            'file' => new UploadedFile($path, 'hogares.xlsx', null, null, true),
        ])->assertOk()->json();

        $this->assertTrue($preview['valid'], json_encode($preview['errors']));
        $this->assertSame([], $preview['warnings']);
        $this->assertSame(['Hogar', 'Opinión'], $preview['sections']);
        [$i1, $i2, $i3, $i4] = $preview['questions'];
        $this->assertSame(['SINGLE_CHOICE', 'NUMBER', 'LIKERT', 'CALCULATE'], [$i1['type'], $i2['type'], $i3['type'], $i4['type']]);
        $this->assertSame($i1['temp_id'], $i2['parent_temp_id']);
        $this->assertSame(['option_index' => 1, 'action' => 'GO_TO', 'next_temp_id' => $i3['temp_id']], $i1['branch_rules'][1]);
        $this->assertSame(['rows' => ['Salud', 'Educación'], 'columns' => ['Malo', 'Regular', 'Bueno']], $i3['options']);
        $this->assertSame('${'.$i2['temp_id'].'} * 2', $i4['properties']['expression']);
    }

    public function test_both_templates_can_be_downloaded(): void
    {
        $simple = $this->get('/api/forms/import/template')->assertOk()->assertDownload('plantilla-encuesta.xlsx');
        $this->assertStringStartsWith('PK', $simple->streamedContent());
        $kobo = $this->get('/api/forms/import/template?formato=xlsform')->assertOk()->assertDownload('plantilla-encuesta-xlsform.xlsx');
        $this->assertStringStartsWith('PK', $kobo->streamedContent());
    }

    private function previewOf(Spreadsheet $book): array
    {
        return $this->postJson('/api/forms/import/preview', ['file' => $this->upload($book)])->assertOk()->json();
    }

    public function test_unreadable_or_unknown_files_explain_the_problem(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'bad').'.xlsx';
        file_put_contents($path, 'esto no es un excel');
        $this->postJson('/api/forms/import/preview', ['file' => new UploadedFile($path, 'roto.xlsx', null, null, true)])->assertStatus(422);
        file_put_contents($path, "PK\x03\x04 archivo dañado");
        $broken = (new \App\Domain\Forms\Services\XlsForm\QuestionnaireImporter)->import($path);
        $this->assertStringContainsString('no se pudo leer', $broken['errors'][0]['message']);
        $this->assertStringContainsString('no se pudo leer', (new \App\Domain\Forms\Services\XlsForm\XlsFormImporter)->import($path)['errors'][0]['message']);

        $unknown = new Spreadsheet;
        $unknown->getActiveSheet()->fromArray([['Nombre', 'Edad']], null, 'A1');
        $this->assertStringContainsString('No se reconoce el formato', $this->previewOf($unknown)['errors'][0]['message']);

        $onlyExample = new Spreadsheet;
        $onlyExample->getActiveSheet()->setTitle('Ejemplo')->fromArray([['Pregunta', 'Tipo'], ['Edad', 'Número']], null, 'A1');
        $this->assertStringContainsString('hoja «Mi encuesta»', $this->previewOf($onlyExample)['errors'][0]['message']);
    }

    public function test_simple_format_covers_every_type_and_reports_bad_links(): void
    {
        $preview = $this->previewOf($this->simpleBook([
            ['1', 'S', 'Hombres', 'Número'],
            ['2', 'S', 'Total', 'Cálculo', '', '', '', '', '', '', '[1] * 2'],
            ['3', 'S', 'Mal cálculo', 'Cálculo', '', '', '', '', '', '', '[9] + abc'],
            ['4', 'S', 'Firma', 'Firma'],
            ['5', 'S', 'Foto', 'Foto'],
            ['6', 'S', 'Ubicación', 'Ubicación GPS'],
            ['7', 'S', 'Código', 'Código QR o de barras'],
            ['8', 'S', 'Escala', 'Calificación', '20'],
            ['9', 'S', 'Fecha', 'Fecha', '', 'Sí'],
            ['10', 'S', 'Ordenar', 'Ordenar', 'A, B, C'],
            ['11', 'S', 'Texto', 'Texto', '', 'No', 'Pasaporte', 'Escriba aquí', 'A → 2'],
            ['12', 'T', 'Hija', 'Texto', '', '', '', '', '', '1'],
            ['13', 'S', 'Vuelve S', 'Texto'],
            ['14', 'S', 'Matriz vacía', 'Matriz'],
            ['14', 'S', 'Repetida', 'Texto'],
            ['15', 'S', '', 'Texto'],
            ['16', 'S', '¿Sigue?', 'Opción única', 'Sí; No', '', '', '', 'Sí 12'],
        ]));

        $q = collect($preview['questions'])->keyBy('name');
        $this->assertSame('${'.$q['1']['temp_id'].'} * 2', $q['2']['properties']['expression']);
        $this->assertSame('SIGNATURE', $q['4']['type']);
        $this->assertSame('image', $q['5']['properties']['allowed_media']);
        $this->assertSame(['GPS', 'BARCODE', 'RATING', 'DATE', 'RANKING'], [$q['6']['type'], $q['7']['type'], $q['8']['type'], $q['9']['type'], $q['10']['type']]);
        $this->assertSame(5, $q['8']['properties']['max_rating']);
        $this->assertSame('Escriba aquí', $q['11']['properties']['help_text']);
        $this->assertNull($q['12']['parent_temp_id']);

        $messages = collect([...$preview['errors'], ...$preview['warnings']])->map(fn ($e) => $e['row'].': '.$e['message'])->implode(' | ');
        foreach ([
            '4: El «Cálculo» usa', '9: La calificación admite de 3 a 10', '11: Las opciones parecen separadas por comas',
            '12: El formato «Pasaporte» no existe', '12: Los saltos solo funcionan', '13: «Subpregunta de» indica la 1',
            '14: La sección «S» aparece en filas separadas', '15: La matriz «Matriz vacía» no tiene filas', '16: El N.º 14 está repetido',
            '17: Falta el texto de la «Pregunta»', '18: No se entendió el salto',
        ] as $expected) {
            $this->assertStringContainsString($expected, $messages);
        }
    }

    public function test_xlsform_covers_media_ranges_groups_and_localized_labels(): void
    {
        $preview = $this->previewOf($this->book([
            ['type', 'name', 'label::English (en)', 'label::Español (es)', 'hint', 'required', 'appearance', 'parameters', 'formato', 'saltos', 'subpregunta_de', 'constraint'],
            ['begin_group', 'g1', 'Group', 'Grupo', '', '', '', '', '', '', '', ''],
            ['begin_group', 'g2', 'Inner', 'Interno', '', '', '', '', '', '', '', ''],
            ['image', 'firma', 'Sign', 'Firme', '', '', 'signature', '', '', '', '', ''],
            ['end_group', '', '', '', '', '', '', '', '', '', '', ''],
            ['audio', 'voz', 'Voice', 'Voz', '', '', '', '', '', '', '', ''],
            ['video', 'vid', 'Video', 'Video', '', '', '', '', '', '', '', ''],
            ['file', 'arch', 'File', 'Archivo', '', '', '', '', '', '', '', ''],
            ['range', 'nivel', 'Level', 'Nivel', '', '', '', 'start=1 end=20', '', '', '', ''],
            ['geopoint', 'gps', 'Where', 'Dónde', '', '', '', '', '', '', '', ''],
            ['barcode', 'cod', 'Code', 'Código', '', '', '', '', '', '', '', ''],
            ['acknowledge', 'ok', 'OK', 'De acuerdo', '', '', '', '', '', '', '', ''],
            ['text', 'correo', 'Mail', 'Correo', '', 'yes', '', '', 'pasaporte', 'x => y', 'inexistente', 'regex(.)'],
            ['select_one si_no', 'sigue', 'Go on', '¿Sigue?', '', '', '', '', '', 'Tal vez => fin; Sí => nada; malformado; No => fin', '', ''],
            ['select_one_from_file x.csv', 'f', 'F', 'F', '', '', '', '', '', '', '', ''],
            ['begin_repeat', 'r', 'R', 'R', '', '', '', '', '', '', '', ''],
            ['text', 'otro', 'Other', 'Otro', '', '', '', '', '', '', '', ''],
            ['end_repeat', '', '', '', '', '', '', '', '', '', '', ''],
            ['begin_group', 'tabla', 'Table', 'Tabla', '', '', 'table-list', '', '', '', '', ''],
            ['text', 'no_select', 'Not select', 'No select', '', '', '', '', '', '', '', ''],
            ['end_group', '', '', '', '', '', '', '', '', '', '', ''],
            ['end_group', '', '', '', '', '', '', '', '', '', '', ''],
            ['end_group', '', '', '', '', '', '', '', '', '', '', ''],
            ['', '', '', 'Sin tipo', '', '', '', '', '', '', '', ''],
            ['select_one', 'sinlista', 'X', 'X', '', '', '', '', '', '', '', ''],
            ['begin_group', 'abierto', 'Open', 'Abierto', '', '', '', '', '', '', '', ''],
        ], [['si_no', 'si', 'Sí'], ['si_no', 'no', 'No'], ['', 'huerfana', 'Sin lista']]));

        $q = collect($preview['questions'])->keyBy('name');
        $this->assertSame('SIGNATURE', $q['firma']['type']);
        $this->assertSame('Firme', $q['firma']['label']);
        $this->assertSame(['audio', 'video', 'all'], [$q['voz']['properties']['allowed_media'], $q['vid']['properties']['allowed_media'], $q['arch']['properties']['allowed_media']]);
        $this->assertSame(10, $q['nivel']['properties']['max_rating']);
        $this->assertSame('NOTE', $q['ok']['type']);
        $this->assertSame('END_FORM', $q['sigue']['branch_rules'][1]['action']);
        $this->assertSame('Grupo', $q['otro']['section_name']);

        $messages = collect([...$preview['errors'], ...$preview['warnings']])->pluck('message')->implode(' | ');
        foreach (['dentro de otro grupo', 'repetibles', 'se ajustó a 10', 'acknowledge', 'pasaporte', 'constraint', 'no es una matriz',
            'Hay un «end_group» sin', 'La fila no tiene tipo', 'Falta el nombre de la lista', 'no tiene «end_group»', 'Falta «list_name»',
            'Tal vez', 'No se entendió el salto', 'no existe o está antes', 'subpregunta_de', 'solo se aplican a preguntas de opción única'] as $expected) {
            $this->assertStringContainsString($expected, $messages, $messages);
        }
    }

    public function test_xlsform_export_covers_every_question_type(): void
    {
        $project = Project::create(['name' => 'Tipos', 'created_by' => $this->leader->id]);
        $project->leaders()->attach($this->leader->id);
        $form = Form::create([
            'title' => 'Tipos', 'user_id' => $this->leader->id, 'project_id' => $project->id,
            'state' => 'DRAFT', 'link_uuid' => (string) Str::uuid(), 'consent_text' => 'Acepto participar en la encuesta.',
        ]);
        $types = [
            ['RATING', ['max_rating' => 7]], ['SIGNATURE', []], ['MULTIMEDIA', ['allowed_media' => 'video']],
            ['MULTIMEDIA', ['allowed_media' => 'both']], ['NOTE', ['help_text' => 'Ayuda']], ['GPS', []],
            ['DATE', []], ['TIME', []], ['DATETIME', []], ['BARCODE', []], ['TEXT', ['text_format' => 'email']],
        ];
        foreach ($types as $i => [$type, $properties]) {
            $form->questions()->create(['type' => $type, 'label' => "P{$i}", 'order' => $i, 'required' => true, 'properties' => $properties]);
        }

        foreach (['?formato=xlsform', ''] as $format) {
            $download = $this->get("/api/forms/{$form->id}/instrument.xlsx{$format}")->assertOk();
            $path = tempnam(sys_get_temp_dir(), 'tipos').'.xlsx';
            file_put_contents($path, $download->streamedContent());
            $preview = $this->postJson('/api/forms/import/preview', ['file' => new UploadedFile($path, 'tipos.xlsx', null, null, true)])->assertOk()->json();

            $this->assertTrue($preview['valid'], json_encode($preview['errors']));
            $this->assertSame(array_column($types, 0), array_column($preview['questions'], 'type'), $format);
            $this->assertSame('email', $preview['questions'][10]['properties']['text_format']);
            $this->assertSame(7, $preview['questions'][0]['properties']['max_rating']);
        }
    }
}
