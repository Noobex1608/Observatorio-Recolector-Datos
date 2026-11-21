<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Form;
use App\Models\FormResponse;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

/** Opciones en cascada (provincia → cantón) y modo de prueba del formulario sin publicarlo. */
class CascadingChoicesAndTestModeTest extends TestCase
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

    private function cascadeBook(string $filter = 'provincia=${provincia}'): Spreadsheet
    {
        $book = new Spreadsheet;
        $book->getActiveSheet()->setTitle('survey')->fromArray([
            ['type', 'name', 'label', 'choice_filter'],
            ['select_one provincias', 'provincia', 'Provincia', ''],
            ['select_one cantones', 'canton', 'Cantón', $filter],
            ['select_multiple cantones', 'otros', 'Otros cantones visitados', 'provincia=${provincia}'],
        ], null, 'A1', true);
        $book->createSheet()->setTitle('choices')->fromArray([
            ['list_name', 'name', 'label', 'provincia'],
            ['provincias', 'manabi', 'Manabí', ''],
            ['provincias', 'guayas', 'Guayas', ''],
            ['cantones', 'portoviejo', 'Portoviejo', 'manabi'],
            ['cantones', 'manta', 'Manta', 'manabi'],
            ['cantones', 'guayaquil', 'Guayaquil', 'guayas'],
            // El mismo texto en dos provincias se une en una sola opción.
            ['cantones', 'olmedo_m', 'Olmedo', 'manabi'],
            ['cantones', 'olmedo_g', 'Olmedo', 'guayas'],
            ['cantones', 'otro', 'Otro', ''],
        ], null, 'A1', true);

        return $book;
    }

    /** @return array{0:Form, 1:string, 2:string} formulario, id provincia, id cantón */
    private function cascadeForm(string $state = 'DEPLOYED'): array
    {
        $project = Project::create(['name' => 'Proyecto cantonal']);
        $form = Form::create([
            'project_id' => $project->id, 'user_id' => $this->leader->id, 'title' => 'Hogares por cantón',
            'state' => $state, 'link_uuid' => (string) Str::uuid(),
        ]);
        $province = $form->questions()->create(['type' => 'SINGLE_CHOICE', 'label' => 'Provincia', 'required' => true, 'order' => 1, 'options' => ['Manabí', 'Guayas']]);
        $canton = $form->questions()->create([
            'type' => 'SINGLE_CHOICE', 'label' => 'Cantón', 'required' => true, 'order' => 2,
            'options' => ['Portoviejo', 'Manta', 'Guayaquil', 'Otro'],
            'properties' => ['choice_filter' => ['question_id' => $province->id, 'parents' => [['Manabí'], ['Manabí'], ['Guayas'], []]]],
        ]);

        return [$form, $province->id, $canton->id];
    }

    public function test_xlsform_choice_filter_imports_as_cascading_options(): void
    {
        $preview = $this->postJson('/api/forms/import/preview', ['file' => $this->upload($this->cascadeBook())])->assertOk()->json();

        $this->assertTrue($preview['valid'], json_encode($preview['errors']));
        [$province, $canton, $others] = $preview['questions'];
        $this->assertSame(['Portoviejo', 'Manta', 'Guayaquil', 'Olmedo', 'Otro'], $canton['options']);
        $this->assertSame([
            'question_id' => $province['temp_id'],
            'parents' => [['Manabí'], ['Manabí'], ['Guayas'], ['Manabí', 'Guayas'], []],
        ], $canton['properties']['choice_filter']);
        $this->assertSame($province['temp_id'], $others['properties']['choice_filter']['question_id']);
        $this->assertStringContainsString('1 opción(es) no indican', collect($preview['warnings'])->pluck('message')->implode(' | '));
    }

    public function test_reversed_and_unsupported_filters(): void
    {
        $reversed = $this->postJson('/api/forms/import/preview', ['file' => $this->upload($this->cascadeBook('${provincia} = provincia'))])->json();
        $this->assertSame(['Manabí'], $reversed['questions'][1]['properties']['choice_filter']['parents'][0]);

        $compound = $this->postJson('/api/forms/import/preview', ['file' => $this->upload($this->cascadeBook('provincia=${provincia} and x=1'))])->json();
        $this->assertArrayNotHasKey('choice_filter', $compound['questions'][1]['properties']);
        $this->assertStringContainsString('no se pudo convertir', collect($compound['warnings'])->pluck('message')->implode(' | '));

        $missingColumn = $this->postJson('/api/forms/import/preview', ['file' => $this->upload($this->cascadeBook('region=${provincia}'))])->json();
        $this->assertArrayNotHasKey('choice_filter', $missingColumn['questions'][1]['properties']);
    }

    public function test_export_and_reimport_keep_the_cascade(): void
    {
        [$form] = $this->cascadeForm('DRAFT');
        $download = $this->get("/api/forms/{$form->id}/instrument.xlsx?formato=xlsform")->assertOk();
        $path = tempnam(sys_get_temp_dir(), 'exp').'.xlsx';
        file_put_contents($path, $download->streamedContent());

        $preview = $this->postJson('/api/forms/import/preview', ['file' => new UploadedFile($path, 'c.xlsx', null, null, true)])->assertOk()->json();

        $this->assertTrue($preview['valid'], json_encode($preview['errors']));
        [$province, $canton] = $preview['questions'];
        $this->assertSame(['Portoviejo', 'Manta', 'Guayaquil', 'Otro'], $canton['options']);
        $this->assertSame(['question_id' => $province['temp_id'], 'parents' => [['Manabí'], ['Manabí'], ['Guayas'], []]],
            $canton['properties']['choice_filter']);
    }

    public function test_submission_rejects_an_option_of_another_parent(): void
    {
        [$form, $province, $canton] = $this->cascadeForm();
        $this->app['auth']->forgetGuards(); // encuestado anónimo por el enlace público
        $submit = fn (array $data) => $this->postJson("/api/forms/submit/{$form->link_uuid}", [
            'client_submission_id' => (string) Str::uuid(),
            'data' => ['_consentimiento_aceptado' => true, ...$data],
        ]);

        $submit([$province => 'Manabí', $canton => 'Guayaquil'])
            ->assertUnprocessable()->assertJsonValidationErrors("data.{$canton}");
        $submit([$province => 'Manabí', $canton => 'Manta'])->assertCreated();
        $submit([$province => 'Guayas', $canton => 'Otro'])->assertCreated();
    }

    public function test_publication_rejects_a_broken_cascade(): void
    {
        [$form, $province, $canton] = $this->cascadeForm('DRAFT');
        $form->questions()->whereKey($canton)->first()->update([
            'properties' => ['choice_filter' => ['question_id' => $province, 'parents' => [['Los Ríos'], [], [], []]]],
        ]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        app(\App\Domain\Forms\Services\FormSchemaValidator::class)->validateForPublication($form->questions()->get());
    }

    public function test_test_mode_loads_a_draft_and_validates_without_saving(): void
    {
        [$form, $province, $canton] = $this->cascadeForm('DRAFT');

        $this->getJson("/api/forms/{$form->id}/test")->assertOk()
            ->assertJsonPath('test_mode', true)
            ->assertJsonPath('questions.1.properties.choice_filter.question_id', $province);
        // El enlace público no sirve mientras el formulario es borrador.
        $this->getJson("/api/forms/fetch/{$form->link_uuid}")->assertNotFound();

        $this->postJson("/api/forms/{$form->id}/test-submit", ['data' => [$province => 'Guayas', $canton => 'Manta']])
            ->assertUnprocessable()->assertJsonValidationErrors("data.{$canton}");
        $this->postJson("/api/forms/{$form->id}/test-submit", ['data' => [$province => 'Manabí']])
            ->assertUnprocessable()->assertJsonValidationErrors("data.{$canton}");
        $this->postJson("/api/forms/{$form->id}/test-submit", ['data' => ['_consentimiento_aceptado' => true, $province => 'Guayas', $canton => 'Guayaquil']])
            ->assertOk()->assertJsonPath('answered', 2);

        $this->assertSame(0, FormResponse::where('form_id', $form->id)->count());
    }

    public function test_test_mode_is_only_for_people_who_can_see_the_form(): void
    {
        [$form] = $this->cascadeForm('DRAFT');
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_PROJECT]));

        $this->getJson("/api/forms/{$form->id}/test")->assertForbidden();
        $this->postJson("/api/forms/{$form->id}/test-submit", ['data' => []])->assertForbidden();
        $this->getJson("/api/forms/{$form->id}/test-link")->assertForbidden();
    }

    public function test_shared_test_link_works_without_session_and_saves_nothing(): void
    {
        [$form, $province, $canton] = $this->cascadeForm('DRAFT');
        $token = $this->getJson("/api/forms/{$form->id}/test-link")->assertOk()->json('token');
        $this->app['auth']->forgetGuards(); // quien recibe el enlace no tiene sesión

        $this->getJson("/api/forms/public-test/{$form->id}?token={$token}")->assertOk()
            ->assertJsonPath('test_mode', true)
            ->assertJsonPath('questions.1.id', $canton);
        $this->postJson("/api/forms/public-test/{$form->id}/submit?token={$token}", ['data' => [$province => 'Guayas', $canton => 'Manta']])
            ->assertUnprocessable()->assertJsonValidationErrors("data.{$canton}");
        $this->postJson("/api/forms/public-test/{$form->id}/submit?token={$token}", ['data' => ['_consentimiento_aceptado' => true, $province => 'Guayas', $canton => 'Guayaquil']])
            ->assertOk()->assertJsonPath('answered', 2);
        $this->assertSame(0, FormResponse::where('form_id', $form->id)->count());

        // Sin token, con token de otro formulario, alterado o caducado: rechazado.
        [$other] = $this->cascadeForm('DRAFT');
        $this->getJson("/api/forms/public-test/{$form->id}")->assertForbidden();
        $this->getJson("/api/forms/public-test/{$other->id}?token={$token}")->assertForbidden();
        $this->getJson("/api/forms/public-test/{$form->id}?token={$token}x")->assertForbidden();
        $this->travel(8)->days();
        $this->getJson("/api/forms/public-test/{$form->id}?token={$token}")->assertForbidden();
    }
}
