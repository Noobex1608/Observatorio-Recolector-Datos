<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\FormUserShare;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Ficha técnica metodológica por formulario: la edita el equipo, la valida el líder o el delegado. */
class FormTechnicalSheetTest extends TestCase
{
    use RefreshDatabase;

    private User $leader;

    private User $delegate;

    private Project $project;

    private Form $form;

    private const SHEET = [
        'target_universe' => 'Población residente en el Cantón Pichincha mayor de 16 años apta para votar (31,715).',
        'geographic_coverage' => 'Sectores urbanos de la cabecera cantonal y parroquias rurales.',
        'sample_size' => '415 encuestas efectivas: urbana = 269, rural = 146, con ajuste del +5%.',
        'error_margin_confidence' => 'Margen de error de 5%, con un nivel de confianza del 95%.',
        'field_technique' => 'Entrevista presencial hogar por hogar (CAPI).',
        'quality_control' => 'Validación GPS al 100%, supervisión directa.',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $this->delegate = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $this->project = Project::create(['name' => 'Barómetro 2026', 'created_by' => $this->leader->id]);
        $this->project->leaders()->attach($this->leader->id);
        $this->project->delegates()->attach($this->delegate->id);
        $this->form = Form::create([
            'title' => 'Hogares', 'user_id' => $this->leader->id, 'project_id' => $this->project->id,
            'state' => 'DRAFT', 'consent_text' => 'Acepto participar en este levantamiento.',
        ]);
    }

    public function test_empty_sheet_is_a_draft_with_permissions(): void
    {
        Sanctum::actingAs($this->delegate);

        $this->getJson("/api/forms/{$this->form->id}/form-sheet")->assertOk()
            ->assertJsonPath('id', null)->assertJsonPath('status', 'DRAFT')
            ->assertJsonPath('can_edit', true)->assertJsonPath('can_validate', true);
    }

    public function test_delegate_saves_and_validates_and_editing_revokes_validation(): void
    {
        Sanctum::actingAs($this->delegate);
        $url = "/api/forms/{$this->form->id}/form-sheet";

        $this->putJson($url, ['target_universe' => 'Solo el universo'])->assertOk()->assertJsonPath('status', 'DRAFT');
        $this->postJson("{$url}/validate")->assertStatus(422);

        $this->putJson($url, self::SHEET)->assertOk();
        $this->postJson("{$url}/validate")->assertOk()
            ->assertJsonPath('status', 'VALIDATED')->assertJsonPath('validator.id', $this->delegate->id);

        // Guardar sin cambios conserva la validación; cambiar un parámetro la revoca.
        $this->putJson($url, self::SHEET)->assertOk()->assertJsonPath('status', 'VALIDATED');
        $this->putJson($url, ['quality_control' => 'Supervisión aleatoria del 20%.'] + self::SHEET)->assertOk()
            ->assertJsonPath('status', 'DRAFT')->assertJsonPath('validator', null);
    }

    public function test_leader_validates(): void
    {
        Sanctum::actingAs($this->leader);
        $this->putJson("/api/forms/{$this->form->id}/form-sheet", self::SHEET)->assertOk();
        $this->postJson("/api/forms/{$this->form->id}/form-sheet/validate")->assertOk()->assertJsonPath('status', 'VALIDATED');
    }

    public function test_form_editor_can_edit_but_not_validate(): void
    {
        $editor = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        FormUserShare::create(['form_id' => $this->form->id, 'user_id' => $editor->id, 'role' => 'PROJECT']);
        Sanctum::actingAs($editor);

        $this->putJson("/api/forms/{$this->form->id}/form-sheet", self::SHEET)->assertOk()
            ->assertJsonPath('can_validate', false);
        $this->postJson("/api/forms/{$this->form->id}/form-sheet/validate")->assertForbidden();
    }

    public function test_status_cannot_be_set_and_outsiders_are_rejected(): void
    {
        Sanctum::actingAs($this->leader);
        $this->putJson("/api/forms/{$this->form->id}/form-sheet", ['status' => 'VALIDATED'] + self::SHEET)->assertStatus(422);

        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_PROJECT]));
        $this->getJson("/api/forms/{$this->form->id}/form-sheet")->assertForbidden();
        $this->putJson("/api/forms/{$this->form->id}/form-sheet", self::SHEET)->assertForbidden();
    }
}
