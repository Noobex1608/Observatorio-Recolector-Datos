<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\ProjectTechnicalSheet;
use App\Models\ProjectZone;
use App\Models\ProjectZoneUserAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectTechnicalSheetAndZonesTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_technical_sheet_and_zones_with_assignments(): void
    {
        $creator = User::factory()->create(['rol' => User::ROLE_ADMIN]);
        $enumerator1 = User::factory()->create(['rol' => User::ROLE_USER]);

        $project = Project::create([
            'name' => 'Proyecto Test Ficha',
            'description' => 'Descripcion de prueba',
            'created_by' => $creator->id,
        ]);

        $sheet = ProjectTechnicalSheet::create([
            'project_id' => $project->id,
            'description' => 'Levantamiento de datos campo Manta 2026',
            'start_date' => '2026-10-01',
            'end_date' => '2026-10-31',
            'target_sample_size' => 500,
            'status' => 'VALIDATED',
            'validated_by' => $creator->id,
            'validated_at' => now(),
            'created_by' => $creator->id,
        ]);

        $zoneA = ProjectZone::create([
            'project_id' => $project->id,
            'technical_sheet_id' => $sheet->id,
            'name' => 'Zona 1 - Centro',
            'geofence_type' => 'radius',
            'target_lat' => -0.9538200,
            'target_lng' => -80.7456100,
            'radius_meters' => 1000,
            'hierarchy_json' => ['provincia' => '13', 'canton' => '1308'],
            'target_responses' => 250,
        ]);

        ProjectZoneUserAssignment::create([
            'zone_id' => $zoneA->id,
            'user_id' => $enumerator1->id,
            'role' => 'RECOLECTOR',
        ]);

        $this->assertDatabaseHas('project_technical_sheets', [
            'id' => $sheet->id,
            'status' => 'VALIDATED',
        ]);

        $this->assertDatabaseHas('project_zones', [
            'id' => $zoneA->id,
            'name' => 'Zona 1 - Centro',
        ]);

        $this->assertDatabaseHas('project_zone_user_assignments', [
            'zone_id' => $zoneA->id,
            'user_id' => $enumerator1->id,
        ]);

        $this->assertCount(1, $project->fresh()->zones);
        $this->assertNotNull($project->fresh()->technicalSheet);
        $this->assertEquals('Levantamiento de datos campo Manta 2026', $project->technicalSheet->description);
        $this->assertCount(1, $zoneA->assignedUsers);
        $this->assertEquals($enumerator1->id, $zoneA->assignedUsers->first()->id);
    }
}
