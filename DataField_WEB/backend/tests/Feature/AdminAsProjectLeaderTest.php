<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Un administrador o superadministrador puede ser líder de un proyecto y hacer lo que hace un líder. */
class AdminAsProjectLeaderTest extends TestCase
{
    use RefreshDatabase;

    public function test_admins_appear_as_leader_candidates_and_can_lead_a_project(): void
    {
        $super = User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN, 'name' => 'Ana Super']);
        $admin = User::factory()->create(['rol' => User::ROLE_ADMIN, 'name' => 'Bruno Admin']);
        $leader = User::factory()->create(['rol' => User::ROLE_PROJECT, 'name' => 'Carla Líder']);
        $collector = User::factory()->create(['rol' => User::ROLE_USER]);
        User::factory()->create(['rol' => User::ROLE_ADMIN, 'is_active' => false]);
        Sanctum::actingAs($super);

        $ids = collect($this->getJson('/api/projects/leaders')->assertOk()->json())->pluck('id')->all();
        $this->assertEqualsCanonicalizing([$super->id, $admin->id, $leader->id], $ids);
        // Quien crea el proyecto aparece como primera sugerencia.
        $this->assertSame($super->id, $ids[0]);
        Sanctum::actingAs($admin);
        $this->assertSame($admin->id, $this->getJson('/api/projects/leaders')->json('0.id'));
        Sanctum::actingAs($super);

        // Un recolector no puede ser líder.
        $this->postJson('/api/projects', ['name' => 'P1', 'leader_ids' => [$collector->id]])->assertStatus(422);

        $projectId = $this->postJson('/api/projects', ['name' => 'Hogares Manta', 'leader_ids' => [$super->id]])
            ->assertCreated()->json('id') ?? Project::where('name', 'Hogares Manta')->value('id');
        $this->assertTrue($super->fresh()->leadsProject($projectId));
        $this->assertFalse($admin->fresh()->leadsProject($projectId));

        // Como líder, el superadministrador llena y valida la ficha técnica.
        $url = "/api/projects/{$projectId}/technical-sheet";
        $this->postJson($url, [
            'description' => 'Levantamiento cantonal', 'start_date' => '2026-11-01', 'end_date' => '2026-12-15', 'target_sample_size' => 400,
        ])->assertOk();
        $this->postJson("{$url}/validate")->assertOk()->assertJsonPath('status', 'VALIDATED');

        // Un administrador asignado como líder también queda reconocido.
        $this->putJson("/api/projects/{$projectId}", ['name' => 'Hogares Manta', 'leader_ids' => [$super->id, $admin->id]])->assertOk();
        $this->assertTrue($admin->fresh()->leadsProject($projectId));
    }

    public function test_an_admin_does_not_see_or_assign_super_admins_as_leaders(): void
    {
        $super = User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN]);
        $admin = User::factory()->create(['rol' => User::ROLE_ADMIN]);
        $otherAdmin = User::factory()->create(['rol' => User::ROLE_ADMIN]);
        $leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        Sanctum::actingAs($admin);

        $ids = collect($this->getJson('/api/projects/leaders')->assertOk()->json())->pluck('id')->all();
        $this->assertEqualsCanonicalizing([$admin->id, $otherAdmin->id, $leader->id], $ids);

        $this->postJson('/api/projects', ['name' => 'P1', 'leader_ids' => [$super->id]])->assertStatus(422)
            ->assertJsonPath('message', 'Los líderes deben tener el rol Líder de proyecto o Administrador.');
        $projectId = $this->postJson('/api/projects', ['name' => 'P2', 'leader_ids' => [$admin->id]])->assertCreated()->json('id');

        // Si un superadministrador ya era líder, el administrador puede editar el proyecto sin perderlo.
        Project::findOrFail($projectId)->leaders()->attach($super->id);
        $this->putJson("/api/projects/{$projectId}", ['name' => 'P2', 'leader_ids' => [$admin->id, $super->id, $leader->id]])->assertOk();
        $this->assertTrue($super->fresh()->leadsProject($projectId));
    }
}
