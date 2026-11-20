<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Forms\Services\FormSchemaValidator;
use App\Models\Form;
use App\Models\FormResponse;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

/** Subpreguntas que se muestran solo si en la pregunta padre se elige cierta opción («Otro → especifique»). */
class ShowIfSubquestionTest extends TestCase
{
    use RefreshDatabase;

    private User $leader;

    protected function setUp(): void
    {
        parent::setUp();
        $this->leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
    }

    /** @return array{0:Form, 1:string, 2:string} */
    private function form(string $parentType = 'MULTIPLE_CHOICE', string $state = 'DEPLOYED'): array
    {
        $project = Project::create(['name' => 'Recintos']);
        $form = Form::create(['project_id' => $project->id, 'user_id' => $this->leader->id, 'title' => 'Recinto electoral',
            'state' => $state, 'link_uuid' => (string) Str::uuid()]);
        $parent = $form->questions()->create(['type' => $parentType, 'label' => '¿Quién obstaculizó el acceso?', 'order' => 1,
            'required' => true, 'options' => ['Fuerzas Armadas', 'Policía Nacional', 'Otro (especifique)']]);
        $child = $form->questions()->create(['type' => 'TEXT', 'label' => 'Especifique cuál', 'order' => 2, 'required' => true,
            'parent_question_id' => $parent->id, 'properties' => ['show_if' => ['options' => ['Otro (especifique)']]]]);

        return [$form, $parent->id, $child->id];
    }

    private function submit(Form $form, array $data)
    {
        return $this->postJson("/api/forms/submit/{$form->link_uuid}", [
            'client_submission_id' => (string) Str::uuid(),
            'data' => ['_consentimiento_aceptado' => true, ...$data],
        ]);
    }

    public function test_specify_is_required_only_when_other_is_ticked_and_dropped_otherwise(): void
    {
        [$form, $parent, $child] = $this->form();

        // Sin «Otro»: la especificación obligatoria no se pide, y si viene, no se guarda.
        $this->submit($form, [$parent => ['Fuerzas Armadas']])->assertCreated();
        $this->submit($form, [$parent => ['Policía Nacional'], $child => 'no aplica'])->assertCreated();
        $this->assertArrayNotHasKey($child, FormResponse::latest('created_at')->first()->data);

        // Con «Otro», junto a otras opciones: es obligatoria.
        $this->submit($form, [$parent => ['Fuerzas Armadas', 'Otro (especifique)']])
            ->assertUnprocessable()->assertJsonValidationErrors("data.{$child}");
        $this->submit($form, [$parent => ['Fuerzas Armadas', 'Otro (especifique)'], $child => 'Delegados de un partido'])->assertCreated();
    }

    public function test_it_also_works_with_single_choice_parents(): void
    {
        [$form, $parent, $child] = $this->form('SINGLE_CHOICE');
        $this->submit($form, [$parent => 'Policía Nacional'])->assertCreated();
        $this->submit($form, [$parent => 'Otro (especifique)'])->assertUnprocessable()->assertJsonValidationErrors("data.{$child}");
    }

    public function test_invalid_configurations_are_rejected(): void
    {
        [$form, $parent, $child] = $this->form('MULTIPLE_CHOICE', 'DRAFT');
        $validator = app(FormSchemaValidator::class);

        $form->questions()->whereKey($child)->first()->update(['properties' => ['show_if' => ['options' => ['Ejército']]]]);
        try {
            $validator->validateForPublication($form->questions()->get());
            $this->fail('Se aceptó una opción que no existe en el padre.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey("questions.{$child}.show_if", $e->errors());
        }

        $text = $form->questions()->create(['type' => 'TEXT', 'label' => 'Nombre', 'order' => 3, 'required' => false]);
        $form->questions()->create(['type' => 'TEXT', 'label' => 'X', 'order' => 4, 'required' => false,
            'parent_question_id' => $text->id, 'properties' => ['show_if' => ['options' => ['Ana']]]]);
        $form->questions()->whereKey($child)->first()->update(['properties' => ['show_if' => ['options' => ['Otro (especifique)']]]]);
        $this->expectException(ValidationException::class);
        $validator->validateForPublication($form->questions()->get());
    }

    public function test_xlsform_relevant_imports_and_round_trips(): void
    {
        Sanctum::actingAs($this->leader);
        $book = new Spreadsheet;
        $book->getActiveSheet()->setTitle('survey')->fromArray([
            ['type', 'name', 'label', 'relevant'],
            ['select_multiple actores', 'actores', '¿Quién obstaculizó el acceso?', ''],
            ['text', 'otro_actor', 'Especifique cuál', "selected(\${actores}, 'otro') or selected(\${actores}, 'delegados')"],
            ['text', 'raro', 'Pregunta con otra condición', '${actores} != \'fa\''],
        ], null, 'A1', true);
        $book->createSheet()->setTitle('choices')->fromArray([
            ['list_name', 'name', 'label'],
            ['actores', 'fa', 'Fuerzas Armadas'],
            ['actores', 'delegados', 'Delegados de partidos'],
            ['actores', 'otro', 'Otro (especifique)'],
        ], null, 'A1', true);
        $path = tempnam(sys_get_temp_dir(), 'xls').'.xlsx';
        (new Xlsx($book))->save($path);

        $preview = $this->postJson('/api/forms/import/preview', ['file' => new UploadedFile($path, 'r.xlsx', null, null, true)])->assertOk()->json();
        [$parent, $child, $odd] = $preview['questions'];
        $this->assertSame($parent['temp_id'], $child['parent_temp_id']);
        $this->assertSame(['options' => ['Otro (especifique)', 'Delegados de partidos']], $child['properties']['show_if']);
        $this->assertNull($odd['parent_temp_id']);
        $this->assertStringContainsString('La condición «relevant»', collect($preview['warnings'])->pluck('message')->implode(' | '));

        // Exportar a XLSForm y volver a importar conserva la condición.
        [$form] = $this->form('MULTIPLE_CHOICE', 'DRAFT');
        $form->project->leaders()->attach($this->leader->id);
        $download = $this->get("/api/forms/{$form->id}/instrument.xlsx?formato=xlsform")->assertOk();
        $out = tempnam(sys_get_temp_dir(), 'exp').'.xlsx';
        file_put_contents($out, $download->streamedContent());
        $again = $this->postJson('/api/forms/import/preview', ['file' => new UploadedFile($out, 'e.xlsx', null, null, true)])->assertOk()->json();
        $this->assertSame(['options' => ['Otro (especifique)']], $again['questions'][1]['properties']['show_if']);
        $this->assertSame($again['questions'][0]['temp_id'], $again['questions'][1]['parent_temp_id']);
    }
}
