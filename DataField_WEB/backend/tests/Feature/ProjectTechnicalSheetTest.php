<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\Project;
use App\Models\ProjectTechnicalSheet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Ficha técnica única por proyecto: periodo, validación y combinación de las fichas por formulario. */
class ProjectTechnicalSheetTest extends TestCase
{
    use RefreshDatabase;

    private User $leader;

    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $this->project = Project::create(['name' => 'Barómetro 2026', 'created_by' => $this->leader->id]);
        $this->project->leaders()->attach($this->leader->id);
    }

    private function form(string $title, ?string $start = null, ?string $end = null): Form
    {
        return Form::create([
            'title' => $title, 'user_id' => $this->leader->id, 'project_id' => $this->project->id,
            'state' => 'DRAFT', 'consent_text' => 'Acepto participar en este levantamiento.',
            'start_date' => $start, 'end_date' => $end,
        ]);
    }

    public function test_one_sheet_unlocks_every_form_of_the_project(): void
    {
        $a = $this->form('Hogares');
        $b = $this->form('Comercios');
        Sanctum::actingAs($this->leader);
        $question = ['type' => 'TEXT', 'label' => 'Pregunta', 'required' => true, 'order' => 1];

        $this->postJson("/api/forms/{$a->id}/questions", $question)->assertStatus(422)
            ->assertJsonPath('message', 'El líder debe validar la ficha técnica del proyecto antes de editar preguntas');

        $this->postJson("/api/projects/{$this->project->id}/technical-sheet", [
            'description' => 'Levantamiento cantonal', 'start_date' => '2026-11-01', 'end_date' => '2026-12-15', 'target_sample_size' => 800,
        ])->assertOk()->assertJsonPath('status', 'DRAFT');
        $this->postJson("/api/projects/{$this->project->id}/technical-sheet/validate")->assertOk()->assertJsonPath('status', 'VALIDATED');

        $this->postJson("/api/forms/{$a->id}/questions", $question)->assertCreated();
        $this->postJson("/api/forms/{$b->id}/questions", $question)->assertCreated();
        $this->getJson("/api/forms/{$b->id}/technical-sheet")->assertOk()
            ->assertJsonPath('project_id', $this->project->id)->assertJsonPath('target_sample_size', 800);
        $this->assertSame(1, ProjectTechnicalSheet::count());
    }

    public function test_form_dates_must_fall_inside_the_project_period(): void
    {
        ProjectTechnicalSheet::create([
            'project_id' => $this->project->id, 'description' => 'Periodo',
            'start_date' => '2026-11-01', 'end_date' => '2026-12-15', 'status' => 'VALIDATED',
        ]);
        Sanctum::actingAs($this->leader);
        $payload = ['project_id' => $this->project->id, 'title' => 'Hogares', 'consent_text' => 'Acepto participar en este levantamiento.'];

        $this->postJson('/api/forms', [...$payload, 'start_date' => '2026-10-20', 'end_date' => '2026-11-10'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Las fechas del formulario deben estar dentro del periodo del proyecto (01/11/2026 al 15/12/2026).');
        $formId = $this->postJson('/api/forms', [...$payload, 'start_date' => '2026-11-05', 'end_date' => '2026-11-30'])
            ->assertCreated()->json('id');

        $this->putJson("/api/forms/{$formId}", ['end_date' => '2026-12-31'])->assertStatus(422);
        $this->putJson("/api/forms/{$formId}", ['end_date' => '2026-12-10'])->assertOk()->assertJsonPath('end_date', '2026-12-10');
    }

    public function test_validation_lists_forms_that_fall_outside_a_new_period(): void
    {
        $this->form('Hogares', '2026-11-05', '2026-11-30');
        $this->form('Comercios', '2026-12-01', '2026-12-20');
        $this->form('Archivada', '2025-01-01', '2025-01-31')->update(['state' => 'ARCHIVED']);
        Sanctum::actingAs($this->leader);
        $url = "/api/projects/{$this->project->id}/technical-sheet";

        $this->postJson($url, ['description' => 'Periodo corto', 'start_date' => '2026-11-01', 'end_date' => '2026-12-10'])->assertOk();
        $this->postJson("{$url}/validate")->assertStatus(422)
            ->assertJsonPath('message', 'Estos formularios tienen fechas fuera del periodo de la ficha: Comercios. Ajuste sus fechas o el periodo antes de validar.');

        $this->postJson($url, ['description' => 'Periodo completo', 'start_date' => '2026-11-01', 'end_date' => '2026-12-31'])->assertOk();
        $this->postJson("{$url}/validate")->assertOk()->assertJsonPath('status', 'VALIDATED');
    }

    public function test_migration_merges_form_sheets_into_one_project_sheet(): void
    {
        $a = $this->form('Hogares');
        $b = $this->form('Comercios');
        $other = Project::create(['name' => 'Otro proyecto']);
        $c = Form::create(['title' => 'Única', 'user_id' => $this->leader->id, 'project_id' => $other->id, 'state' => 'DRAFT']);
        $sheet = fn (Form $form, array $values) => DB::table('form_technical_sheets')->insert($values + [
            'id' => (string) Str::uuid(), 'form_id' => $form->id, 'created_by' => $this->leader->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $sheet($a, ['description' => 'Hogares urbanos', 'start_date' => '2026-11-10', 'end_date' => '2026-11-30',
            'target_sample_size' => 300, 'status' => 'VALIDATED', 'validated_by' => $this->leader->id, 'validated_at' => now()->subDay()]);
        $sheet($b, ['description' => 'Comercios del centro', 'start_date' => '2026-11-01', 'end_date' => '2026-12-20',
            'target_sample_size' => 200, 'status' => 'VALIDATED', 'validated_by' => $this->leader->id, 'validated_at' => now()]);
        $sheet($c, ['description' => 'Única ficha', 'start_date' => '2026-11-01', 'end_date' => '2026-11-15',
            'target_sample_size' => null, 'status' => 'DRAFT']);

        (require database_path('migrations/2026_10_29_000002_merge_form_technical_sheets_into_projects.php'))->up();

        $merged = ProjectTechnicalSheet::where('project_id', $this->project->id)->firstOrFail();
        $this->assertSame('2026-11-01', $merged->start_date->format('Y-m-d'));
        $this->assertSame('2026-12-20', $merged->end_date->format('Y-m-d'));
        $this->assertSame(500, $merged->target_sample_size);
        $this->assertSame('VALIDATED', $merged->status);
        $this->assertSame("Hogares: Hogares urbanos\n\nComercios: Comercios del centro", $merged->description);

        $single = ProjectTechnicalSheet::where('project_id', $other->id)->firstOrFail();
        $this->assertSame('DRAFT', $single->status, 'Una ficha sin validar deja la del proyecto en borrador');
        $this->assertSame('Única ficha', $single->description);
        $this->assertNull($single->target_sample_size);
        $this->assertSame(3, DB::table('form_technical_sheets')->count(), 'Las fichas por formulario se conservan como historial');
    }
}
