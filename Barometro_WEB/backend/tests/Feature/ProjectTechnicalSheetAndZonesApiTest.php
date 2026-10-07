<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProjectTechnicalSheetAndZonesApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_technical_sheet_crud_and_validation(): void
    {
        $admin = User::factory()->create(['rol' => User::ROLE_ADMIN]);
        Sanctum::actingAs($admin);

        $project = Project::create([
            'name' => 'Proyecto API Test',
            'description' => 'Prueba de endpoints',
            'created_by' => $admin->id,
        ]);

        // 1. Guardar borrador de Ficha Técnica
        $response = $this->postJson("/api/projects/{$project->id}/technical-sheet", [
            'description' => 'Levantamiento de campo 2026',
            'start_date' => '2026-10-01',
            'end_date' => '2026-10-31',
            'target_sample_size' => 400,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('description', 'Levantamiento de campo 2026')
            ->assertJsonPath('status', 'DRAFT');

        // 2. Obtener Ficha Técnica
        $responseGet = $this->getJson("/api/projects/{$project->id}/technical-sheet");
        $responseGet->assertStatus(200)
            ->assertJsonPath('target_sample_size', 400);

        // 3. Validar Ficha Técnica
        $responseValidate = $this->postJson("/api/projects/{$project->id}/technical-sheet/validate");
        $responseValidate->assertStatus(200)
            ->assertJsonPath('status', 'VALIDATED')
            ->assertJsonPath('validated_by', $admin->id);
    }

    public function test_api_zones_crud_and_enumerator_assignments(): void
    {
        $admin = User::factory()->create(['rol' => User::ROLE_ADMIN]);
        $enumerator1 = User::factory()->create(['rol' => User::ROLE_USER]);
        $enumerator2 = User::factory()->create(['rol' => User::ROLE_USER]);
        Sanctum::actingAs($admin);

        $project = Project::create([
            'name' => 'Proyecto API Zonas',
            'created_by' => $admin->id,
        ]);

        // 1. Crear Zona 1
        $responseZone1 = $this->postJson("/api/projects/{$project->id}/zones", [
            'name' => 'Zona Norte',
            'geofence_type' => 'radius',
            'target_lat' => -0.9538,
            'target_lng' => -80.7456,
            'radius_meters' => 600,
            'assigned_user_ids' => [$enumerator1->id],
        ]);

        $responseZone1->assertStatus(201)
            ->assertJsonPath('name', 'Zona Norte')
            ->assertJsonCount(1, 'assigned_users');

        $zone1Id = $responseZone1->json('id');

        // 2. Crear Zona 2
        $responseZone2 = $this->postJson("/api/projects/{$project->id}/zones", [
            'name' => 'Zona Sur',
            'geofence_type' => 'manzana_polygon',
            'hierarchy_json' => ['provincia' => '13', 'canton' => '1308'],
            'assigned_user_ids' => [$enumerator2->id],
        ]);

        $responseZone2->assertStatus(201);
        $zone2Id = $responseZone2->json('id');

        // 3. Listar Zonas
        $responseList = $this->getJson("/api/projects/{$project->id}/zones");
        $responseList->assertStatus(200)
            ->assertJsonCount(2);

        // 4. Bulk Assign: Reasignar encuestadores
        $responseBulk = $this->postJson("/api/projects/{$project->id}/zones/bulk-assign", [
            'assignments' => [
                ['zone_id' => $zone1Id, 'user_ids' => [$enumerator1->id, $enumerator2->id]],
                ['zone_id' => $zone2Id, 'user_ids' => []],
            ],
        ]);

        $responseBulk->assertStatus(200);

        // 5. Eliminar Zona 2
        $this->deleteJson("/api/projects/{$project->id}/zones/{$zone2Id}")
            ->assertStatus(204);

        $this->getJson("/api/projects/{$project->id}/zones")
            ->assertStatus(200)
            ->assertJsonCount(1);
    }
}
