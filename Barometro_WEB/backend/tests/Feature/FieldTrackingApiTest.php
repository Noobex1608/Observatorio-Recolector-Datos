<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\Project;
use App\Models\ProjectZone;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FieldTrackingApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_start_requires_a_shared_form_and_the_selected_assigned_zone(): void
    {
        $leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $collector = User::factory()->create(['rol' => User::ROLE_USER]);
        $project = Project::create(['name' => 'Proyecto de campo']);
        $form = Form::create([
            'project_id' => $project->id, 'user_id' => $leader->id,
            'title' => 'Levantamiento', 'state' => 'DEPLOYED',
        ]);
        $assignedZone = ProjectZone::create([
            'project_id' => $project->id, 'form_id' => $form->id, 'name' => 'Centro',
        ]);
        $otherZone = ProjectZone::create([
            'project_id' => $project->id, 'form_id' => $form->id, 'name' => 'Norte',
        ]);
        Sanctum::actingAs($collector);

        $this->postJson('/api/mobile/field-tracking/start', [
            'form_id' => $form->id, 'zone_id' => $assignedZone->id,
        ])->assertForbidden()->assertJsonPath('message', 'No tienes asignado este formulario. Solicita acceso al líder del proyecto.');

        $form->shares()->create(['user_id' => $collector->id, 'role' => 'RECOLECTOR']);
        $this->postJson('/api/mobile/field-tracking/start', [
            'form_id' => $form->id, 'zone_id' => $assignedZone->id,
        ])->assertForbidden()->assertJsonPath('message', 'La zona seleccionada no está asignada a tu cuenta en este formulario. Solicita al líder que delimite y asigne la zona.');

        $assignedZone->assignedUsers()->attach($collector->id, ['role' => 'RECOLECTOR']);
        $this->postJson('/api/mobile/field-tracking/start', [
            'form_id' => $form->id, 'zone_id' => $otherZone->id,
        ])->assertForbidden();
        $this->assertDatabaseCount('field_tracking_shifts', 0);

        $this->postJson('/api/mobile/field-tracking/start', [
            'form_id' => $form->id, 'zone_id' => $assignedZone->id,
        ])->assertOk()->assertJsonPath('active', true);
        $this->assertDatabaseCount('field_tracking_shifts', 1);
    }
}
