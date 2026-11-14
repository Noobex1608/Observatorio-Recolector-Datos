<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TechnicalSheetDateValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_end_date_before_start_date_returns_a_readable_spanish_message(): void
    {
        $leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $project = Project::create(['name' => 'Proyecto con fechas']);
        $project->leaders()->attach($leader->id);
        $form = Form::create(['title' => 'Encuesta', 'user_id' => $leader->id, 'project_id' => $project->id, 'state' => 'DRAFT']);

        Sanctum::actingAs($leader);
        $this->postJson("/api/projects/{$project->id}/technical-sheet", [
            'description' => 'Lo que sea',
            'start_date' => '2026-10-29',
            'end_date' => '2026-10-28',
            'target_sample_size' => 150,
        ])->assertStatus(422)
            ->assertJsonPath('message', 'La fecha de fin no puede ser anterior a la fecha de inicio.')
            ->assertJsonPath('errors.end_date.0', 'La fecha de fin no puede ser anterior a la fecha de inicio.');

        $this->postJson("/api/projects/{$project->id}/technical-sheet", [
            'description' => 'Lo que sea',
            'start_date' => '2026-10-29',
            'end_date' => '2026-10-29',
            'target_sample_size' => 150,
        ])->assertOk()->assertJsonPath('status', 'DRAFT');
    }
}
