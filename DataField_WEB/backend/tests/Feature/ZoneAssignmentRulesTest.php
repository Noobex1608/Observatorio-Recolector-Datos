<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\FormUserShare;
use App\Models\Project;
use App\Models\ProjectZone;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Reglas de asignación de encuestadores a zonas: solo el equipo del proyecto, retiro del
 * formulario al quedarse sin zona y meta de encuestas por zona.
 */
class ZoneAssignmentRulesTest extends TestCase
{
    use RefreshDatabase;

    private User $leader;

    private Project $project;

    private Form $form;

    protected function setUp(): void
    {
        parent::setUp();
        $this->leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $this->project = Project::create(['name' => 'Proyecto de zonas', 'created_by' => $this->leader->id]);
        $this->project->leaders()->attach($this->leader->id);
        $this->form = Form::create([
            'title' => 'Levantamiento', 'user_id' => $this->leader->id, 'project_id' => $this->project->id,
            'state' => 'DRAFT', 'consent_text' => 'Acepto participar en este levantamiento.',
        ]);
        $this->project->technicalSheet()->create([
            'description' => 'Ficha', 'start_date' => today()->toDateString(),
            'end_date' => today()->addMonth()->toDateString(), 'status' => 'VALIDATED',
        ]);
    }

    private function teamMember(bool $active = true): User
    {
        $user = User::factory()->create(['rol' => User::ROLE_USER]);
        $this->project->collectors()->attach($user->id, ['is_active' => $active]);

        return $user;
    }

    private function zonePayload(string $name, array $userIds, array $extra = []): array
    {
        return [
            'form_id' => $this->form->id, 'name' => $name, 'geofence_type' => 'radius',
            'target_lat' => -0.95, 'target_lng' => -80.72, 'radius_meters' => 500,
            'assigned_user_ids' => $userIds, ...$extra,
        ];
    }

    public function test_only_active_team_members_can_be_assigned(): void
    {
        $member = $this->teamMember();
        $inactive = $this->teamMember(active: false);
        $outsider = User::factory()->create(['rol' => User::ROLE_USER]);
        Sanctum::actingAs($this->leader);
        $url = "/api/projects/{$this->project->id}/zones";

        foreach ([$outsider, $inactive] as $user) {
            $this->postJson($url, $this->zonePayload('Centro', [$user->id]))
                ->assertStatus(422)
                ->assertJsonPath('message', 'Solo puedes asignar encuestadores registrados y activos en este proyecto. Agrégalos en la pestaña Encuestadores.');
        }
        $this->postJson($url, $this->zonePayload('Centro', [$member->id]))->assertCreated();
        $this->assertDatabaseHas('form_user_shares', ['form_id' => $this->form->id, 'user_id' => $member->id, 'role' => 'RECOLECTOR']);
    }

    public function test_people_already_in_a_zone_stay_editable_even_if_not_in_the_team(): void
    {
        $member = $this->teamMember();
        $legacy = User::factory()->create(['rol' => User::ROLE_USER]);
        $outsider = User::factory()->create(['rol' => User::ROLE_USER]);
        $zone = ProjectZone::create(['project_id' => $this->project->id, 'form_id' => $this->form->id, 'name' => 'Antigua']);
        $zone->assignedUsers()->attach($legacy->id, ['role' => 'RECOLECTOR']);
        Sanctum::actingAs($this->leader);
        $url = "/api/projects/{$this->project->id}/zones/{$zone->id}";

        $this->putJson($url, $this->zonePayload('Antigua', [$legacy->id, $member->id]))->assertOk();
        $this->putJson($url, $this->zonePayload('Antigua', [$legacy->id, $outsider->id]))->assertStatus(422);
    }

    public function test_leaving_the_last_zone_of_a_form_removes_access_to_it(): void
    {
        $a = $this->teamMember();
        $b = $this->teamMember();
        Sanctum::actingAs($this->leader);
        $url = "/api/projects/{$this->project->id}/zones";
        $centro = $this->postJson($url, $this->zonePayload('Centro', [$a->id, $b->id]))->assertCreated()->json('id');
        $norte = $this->postJson($url, $this->zonePayload('Norte', [$b->id]))->assertCreated()->json('id');
        $share = fn (User $u) => FormUserShare::where('form_id', $this->form->id)->where('user_id', $u->id)->exists();

        // Se quitan los dos de Centro: A se queda sin zona; B sigue en Norte.
        $this->putJson("{$url}/{$centro}", $this->zonePayload('Centro', []))->assertOk();
        $this->assertFalse($share($a), 'A ya no tiene zonas del formulario');
        $this->assertTrue($share($b), 'B sigue asignado en Norte');

        // Al eliminar Norte, B también se queda sin zona.
        $this->deleteJson("{$url}/{$norte}")->assertNoContent();
        $this->assertFalse($share($b));
        $this->assertDatabaseCount('project_zone_user_assignments', 0);
    }

    public function test_zone_survey_goal_stops_new_submissions_once_reached(): void
    {
        $collector = $this->teamMember();
        $zone = ProjectZone::create([
            'project_id' => $this->project->id, 'form_id' => $this->form->id, 'name' => 'Centro',
            'geofence_type' => 'radius', 'target_lat' => -0.95, 'target_lng' => -80.72,
            'radius_meters' => 500, 'target_responses' => 2,
        ]);
        $zone->assignedUsers()->attach($collector->id, ['role' => 'RECOLECTOR']);
        $this->form->shares()->create(['user_id' => $collector->id, 'role' => 'RECOLECTOR']);
        $question = $this->form->questions()->create(['type' => 'TEXT', 'label' => 'Respuesta', 'required' => true, 'order' => 1]);
        $this->form->update(['state' => 'DEPLOYED', 'link_uuid' => (string) Str::uuid(), 'instrument_locked' => true]);

        Sanctum::actingAs($collector);
        $submit = fn () => $this->postJson('/api/mobile/submit', [
            'form_id' => $this->form->id, 'client_submission_id' => (string) Str::uuid(),
            'data' => [
                $question->id => 'Dato', '_consentimiento_aceptado' => true,
                '_project_geofence' => ['zone_id' => $zone->id, 'latitud' => -0.95, 'longitud' => -80.72, 'fuera_de_zona' => false],
            ],
        ]);

        $submit()->assertCreated();
        $submit()->assertCreated();
        $submit()->assertStatus(422)->assertJsonPath('message', 'La zona «Centro» ya alcanzó su meta de 2 encuestas.');
        $this->assertSame(2, $this->form->responses()->count());
    }

    public function test_removed_collector_keeps_personal_goal_archived_and_gets_it_back(): void
    {
        $collector = $this->teamMember();
        Sanctum::actingAs($this->leader);
        $url = "/api/projects/{$this->project->id}/zones";
        $zoneId = $this->postJson($url, $this->zonePayload('Centro', [$collector->id]))->assertCreated()->json('id');
        FormUserShare::where('form_id', $this->form->id)->where('user_id', $collector->id)->update(['target_responses' => 25]);

        $this->putJson("{$url}/{$zoneId}", $this->zonePayload('Centro', []))->assertOk();
        $this->assertDatabaseMissing('form_user_shares', ['form_id' => $this->form->id, 'user_id' => $collector->id]);
        $this->assertDatabaseHas('form_user_share_archives', ['form_id' => $this->form->id, 'user_id' => $collector->id, 'target_responses' => 25]);

        // El archivo no da acceso: no ve el formulario en la app mientras esté inactivo.
        $this->form->update(['state' => 'DEPLOYED', 'link_uuid' => (string) Str::uuid()]);
        Sanctum::actingAs($collector);
        $this->getJson('/api/mobile/forms/metadata')->assertOk()->assertJsonCount(0);

        Sanctum::actingAs($this->leader);
        $this->putJson("{$url}/{$zoneId}", $this->zonePayload('Centro', [$collector->id]))->assertOk();
        $this->assertDatabaseHas('form_user_shares', ['form_id' => $this->form->id, 'user_id' => $collector->id, 'target_responses' => 25]);
        $this->assertDatabaseCount('form_user_share_archives', 0);
    }

    public function test_deactivating_a_team_member_also_archives_the_goal(): void
    {
        $collector = $this->teamMember();
        Sanctum::actingAs($this->leader);
        $this->postJson("/api/projects/{$this->project->id}/zones", $this->zonePayload('Centro', [$collector->id]))->assertCreated();
        FormUserShare::where('form_id', $this->form->id)->where('user_id', $collector->id)->update(['target_responses' => 7]);

        $this->patchJson("/api/projects/{$this->project->id}/collectors/{$collector->id}", ['is_active' => false])->assertOk();
        $this->assertDatabaseHas('form_user_share_archives', ['user_id' => $collector->id, 'target_responses' => 7]);

        $this->patchJson("/api/projects/{$this->project->id}/collectors/{$collector->id}", ['is_active' => true])->assertOk();
        $this->postJson("/api/projects/{$this->project->id}/collectors/assign-forms", [
            'user_ids' => [$collector->id], 'form_ids' => [$this->form->id],
        ])->assertOk()->assertJsonPath('assigned', 1);
        $this->assertDatabaseHas('form_user_shares', ['user_id' => $collector->id, 'target_responses' => 7]);
    }

    public function test_mobile_payloads_include_zone_goal_progress(): void
    {
        $collector = $this->teamMember();
        $zone = ProjectZone::create([
            'project_id' => $this->project->id, 'form_id' => $this->form->id, 'name' => 'Centro',
            'geofence_type' => 'radius', 'target_lat' => -0.95, 'target_lng' => -80.72,
            'radius_meters' => 500, 'target_responses' => 10,
        ]);
        $zone->assignedUsers()->attach($collector->id, ['role' => 'RECOLECTOR']);
        $this->form->shares()->create(['user_id' => $collector->id, 'role' => 'RECOLECTOR']);
        $this->form->update(['state' => 'DEPLOYED', 'link_uuid' => (string) Str::uuid()]);
        foreach (range(1, 3) as $_) {
            $this->form->responses()->create([
                'user_id' => $collector->id, 'client_submission_id' => (string) Str::uuid(), 'submission_hash' => hash('sha256', Str::uuid()),
                'data' => ['_project_geofence' => ['zone_id' => $zone->id]],
            ]);
        }

        Sanctum::actingAs($collector);
        $this->getJson('/api/mobile/forms')->assertOk()
            ->assertJsonPath('0.project_zones.0.id', $zone->id)
            ->assertJsonPath('0.project_zones.0.target_responses', 10)
            ->assertJsonPath('0.project_zones.0.responses_count', 3);
        $this->getJson('/api/mobile/forms/metadata')->assertOk()
            ->assertJsonPath('0.zones_progress.0.id', $zone->id)
            ->assertJsonPath('0.zones_progress.0.target_responses', 10)
            ->assertJsonPath('0.zones_progress.0.responses_count', 3);
    }
}
