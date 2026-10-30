<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\Project;
use App\Models\ProjectZone;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProjectTechnicalSheetAndZonesApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_leader_delimits_form_before_randomly_assigning_collectors(): void
    {
        $leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $collectorA = User::factory()->create(['rol' => User::ROLE_USER]);
        $collectorB = User::factory()->create(['rol' => User::ROLE_USER]);
        $project = Project::create(['name' => 'Proyecto API Zonas', 'created_by' => $leader->id]);
        $project->leaders()->attach($leader->id);
        Sanctum::actingAs($leader);

        $formId = $this->postJson('/api/forms', [
            'project_id' => $project->id,
            'title' => 'Levantamiento',
            'consent_text' => 'Acepto participar en este levantamiento de información.',
        ])->assertCreated()->json('id');

        $this->postJson("/api/projects/{$project->id}/zones", [
            'form_id' => $formId, 'name' => 'Centro', 'geofence_type' => 'radius',
            'target_lat' => -0.95, 'target_lng' => -80.72, 'radius_meters' => 500,
        ])->assertStatus(422);

        $this->postJson("/api/projects/{$project->id}/technical-sheet", [
            'description' => 'Levantamiento territorial',
            'start_date' => today()->format('Y-m-d'),
            'end_date' => today()->addMonth()->format('Y-m-d'),
        ])->assertOk();
        $this->postJson("/api/projects/{$project->id}/technical-sheet/validate")->assertOk();

        foreach (['Centro', 'Norte'] as $name) {
            $this->postJson("/api/projects/{$project->id}/zones", [
                'form_id' => $formId, 'name' => $name, 'geofence_type' => 'radius',
                'target_lat' => -0.95, 'target_lng' => -80.72, 'radius_meters' => 500,
                'assigned_count' => 1,
            ])->assertCreated();
        }

        // Se indica solo la cantidad: el sorteo es entre el equipo activo del proyecto.
        $url = "/api/projects/{$project->id}/zones/random-assign";
        $this->postJson($url, ['form_id' => $formId, 'count' => 1, 'dry_run' => true])
            ->assertStatus(422)->assertJsonPath('message', 'El proyecto no tiene encuestadores activos. Agrégalos en la pestaña Encuestadores.');
        $collectorC = User::factory()->create(['rol' => User::ROLE_USER]);
        $outsider = User::factory()->create(['rol' => User::ROLE_USER]);
        $project->collectors()->attach([
            $collectorA->id => ['is_active' => true], $collectorB->id => ['is_active' => true],
            $collectorC->id => ['is_active' => true],
        ]);
        $this->postJson($url, ['form_id' => $formId, 'count' => 4, 'dry_run' => true])
            ->assertStatus(422)->assertJsonPath('message', 'Solo hay 3 encuestadores activos en el proyecto.');
        $this->postJson($url, ['form_id' => $formId, 'count' => 3, 'dry_run' => true])
            ->assertStatus(422)->assertJsonPath('message', 'Las zonas admiten como máximo 2 encuestadores en total.');

        $request = ['form_id' => $formId, 'count' => 2, 'seed' => 'prueba-estable'];
        $preview = $this->postJson($url, [...$request, 'dry_run' => true])->assertOk()
            ->assertJsonPath('pool_size', 3)->assertJsonCount(2, 'users')->json();
        $chosen = array_column($preview['users'], 'id');
        $this->assertNotContains($outsider->id, $chosen);
        $this->postJson($url, [...$request, 'dry_run' => false, 'expected_user_ids' => [$outsider->id, $chosen[0]]])
            ->assertStatus(409);
        $actual = $this->postJson($url, [...$request, 'dry_run' => false, 'expected_user_ids' => $chosen])
            ->assertOk()->json('assignments');
        $this->assertSame($preview['assignments'], $actual);
        $this->assertCount(2, Form::findOrFail($formId)->zones);
        $this->assertSame(2, array_sum(array_map('count', $actual)));
        $this->assertEqualsCanonicalizing($chosen, array_merge(...array_values($actual)));
    }

    public function test_bulk_assignment_rolls_back_every_zone_when_one_belongs_to_another_project(): void
    {
        $leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $collector = User::factory()->create(['rol' => User::ROLE_USER]);
        $project = Project::create(['name' => 'Proyecto propio']);
        $project->leaders()->attach($leader->id);
        $otherProject = Project::create(['name' => 'Proyecto ajeno']);
        $form = Form::create(['project_id' => $project->id, 'user_id' => $leader->id,
            'title' => 'Formulario propio', 'state' => 'DRAFT']);
        $otherForm = Form::create(['project_id' => $otherProject->id, 'user_id' => $leader->id,
            'title' => 'Formulario ajeno', 'state' => 'DRAFT']);
        $zone = ProjectZone::create(['project_id' => $project->id, 'form_id' => $form->id,
            'name' => 'Zona propia', 'assigned_count' => 1]);
        $foreignZone = ProjectZone::create(['project_id' => $otherProject->id, 'form_id' => $otherForm->id,
            'name' => 'Zona ajena', 'assigned_count' => 1]);
        Sanctum::actingAs($leader);

        $this->postJson("/api/projects/{$project->id}/zones/bulk-assign", [
            'assignments' => [
                ['zone_id' => $zone->id, 'user_ids' => [$collector->id]],
                ['zone_id' => $foreignZone->id, 'user_ids' => [$collector->id]],
            ],
        ])->assertStatus(422);

        $this->assertDatabaseCount('project_zone_user_assignments', 0);
        $this->assertDatabaseCount('form_user_shares', 0);
    }

    public function test_collector_must_submit_with_an_assigned_zone_when_form_has_zones(): void
    {
        $owner = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $collector = User::factory()->create(['rol' => User::ROLE_USER]);
        $project = Project::create(['name' => 'Proyecto zonas']);
        $form = Form::create(['project_id' => $project->id, 'user_id' => $owner->id,
            'title' => 'Censo', 'state' => 'DEPLOYED']);
        $zone = ProjectZone::create(['project_id' => $project->id, 'form_id' => $form->id,
            'name' => 'Zona centro', 'geofence_type' => 'radius',
            'target_lat' => -0.95, 'target_lng' => -80.72, 'radius_meters' => 500]);
        $question = $form->questions()->create(['type' => 'TEXT', 'label' => 'Estado',
            'required' => true, 'order' => 1]);
        $form->shares()->create(['user_id' => $collector->id, 'role' => 'RECOLECTOR']);
        Sanctum::actingAs($collector);
        $data = ['_consentimiento_aceptado' => true, $question->id => 'Bueno'];

        $this->postJson('/api/mobile/submit', ['client_submission_id' => (string) \Illuminate\Support\Str::uuid(), 'form_id' => $form->id, 'data' => $data])
            ->assertStatus(422)->assertJsonValidationErrors('data._project_geofence');
        $data['_project_geofence'] = [
            'zone_id' => $zone->id, 'latitud' => -0.95, 'longitud' => -80.72,
        ];
        $this->postJson('/api/mobile/submit', ['client_submission_id' => (string) \Illuminate\Support\Str::uuid(), 'form_id' => $form->id, 'data' => $data])
            ->assertStatus(422)->assertJsonValidationErrors('data._project_geofence.zone_id');

        $zone->assignedUsers()->attach($collector->id, ['role' => 'RECOLECTOR']);
        $this->postJson('/api/mobile/submit', ['client_submission_id' => (string) \Illuminate\Support\Str::uuid(), 'form_id' => $form->id, 'data' => $data])
            ->assertCreated();
    }
}
