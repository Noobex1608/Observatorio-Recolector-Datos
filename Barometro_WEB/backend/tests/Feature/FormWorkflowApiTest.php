<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FormWorkflowApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_delegate_sheet_leader_validation_zone_and_explicit_publication(): void
    {
        $admin = User::factory()->create(['rol' => User::ROLE_ADMIN]);
        $leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $delegate = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $project = Project::create(['name' => 'Edificaciones', 'created_by' => $admin->id]);
        $project->leaders()->attach($leader->id);
        $project->delegates()->attach($delegate->id);

        Sanctum::actingAs($admin);
        $created = $this->postJson('/api/forms', [
            'project_id' => $project->id,
            'title' => 'Censo de edificios',
            'start_date' => today()->format('Y-m-d'),
            'consent_text' => 'Acepto participar en este censo de edificaciones.',
        ])->assertCreated()->assertJsonPath('state', 'DRAFT');
        $formId = $created->json('id');
        $this->assertNull(Form::findOrFail($formId)->link_uuid);

        $this->postJson("/api/forms/{$formId}/deploy")->assertStatus(422);

        Sanctum::actingAs($delegate);
        $this->putJson("/api/projects/{$project->id}", [
            'name' => 'Edificaciones de Manta',
        ])->assertOk()->assertJsonPath('name', 'Edificaciones de Manta');
        $this->postJson("/api/forms/{$formId}/technical-sheet", [
            'description' => 'Levantamiento en edificios existentes',
            'start_date' => today()->format('Y-m-d'),
            'end_date' => today()->addMonth()->format('Y-m-d'),
            'target_sample_size' => 100,
        ])->assertOk()->assertJsonPath('status', 'DRAFT');
        $this->postJson("/api/forms/{$formId}/technical-sheet/validate")->assertForbidden();

        Sanctum::actingAs($leader);
        $this->postJson("/api/forms/{$formId}/technical-sheet/validate")
            ->assertOk()->assertJsonPath('status', 'VALIDATED');
        $this->postJson("/api/projects/{$project->id}/zones", [
            'form_id' => $formId,
            'name' => 'Centro',
            'geofence_type' => 'radius',
            'target_lat' => -0.95,
            'target_lng' => -80.72,
            'radius_meters' => 500,
        ])->assertCreated()->assertJsonPath('form_id', $formId);
        $this->postJson("/api/forms/{$formId}/deploy")->assertStatus(422);

        $question = $this->postJson("/api/forms/{$formId}/questions", [
            'type' => 'TEXT', 'label' => 'Estado del edificio', 'required' => true, 'order' => 1,
        ])->assertCreated();
        $this->postJson("/api/forms/{$formId}/deploy")->assertOk()->assertJsonPath('state', 'DEPLOYED');
        $link = Form::findOrFail($formId)->link_uuid;

        $this->postJson("/api/forms/submit/{$link}", [
            'data' => [$question->json('id') => 'Bueno'],
        ])->assertStatus(422);
        $this->postJson("/api/forms/submit/{$link}", [
            'data' => [$question->json('id') => 'Bueno', '_consentimiento_aceptado' => true],
        ])->assertCreated();
    }
}
