<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Equipo de encuestadores del proyecto: paginación, búsqueda, seleccionar todos y agregar usuarios existentes. */
class ProjectCollectorTeamTest extends TestCase
{
    use RefreshDatabase;

    private User $leader;

    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $this->project = Project::create(['name' => 'Equipo grande', 'created_by' => $this->leader->id]);
        $this->project->leaders()->attach($this->leader->id);
        Sanctum::actingAs($this->leader);
    }

    private function member(string $name, bool $active = true): User
    {
        $user = User::factory()->create(['rol' => User::ROLE_USER, 'name' => $name]);
        $this->project->collectors()->attach($user->id, ['is_active' => $active]);

        return $user;
    }

    public function test_team_list_is_paginated_searchable_and_keeps_the_full_list_without_page(): void
    {
        foreach (range(1, 30) as $i) {
            $this->member(sprintf('Encuestador %02d', $i));
        }
        $carla = $this->member('Carla Zambrano');
        $form = Form::create(['title' => 'F', 'user_id' => $this->leader->id, 'project_id' => $this->project->id, 'state' => 'DRAFT']);
        $form->shares()->create(['user_id' => $carla->id, 'role' => 'RECOLECTOR']);
        $url = "/api/projects/{$this->project->id}/collectors";

        $this->getJson("{$url}?page=1&per_page=10")->assertOk()
            ->assertJsonCount(10, 'data')
            ->assertJsonPath('pagination.total', 31)
            ->assertJsonPath('pagination.last_page', 4);
        $this->getJson("{$url}?page=1&q=ZAMBRANO")->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $carla->id)
            ->assertJsonPath('data.0.form_ids.0', $form->id);
        $this->assertCount(31, $this->getJson($url)->assertOk()->json());
    }

    public function test_select_all_returns_every_active_member_across_pages(): void
    {
        $ids = collect(range(1, 40))->map(fn ($i) => $this->member("Persona {$i}")->id);
        $this->member('Inactiva', active: false);

        $selected = $this->getJson("/api/projects/{$this->project->id}/collectors/ids")->assertOk()->json();
        $this->assertEqualsCanonicalizing($ids->all(), $selected);
        $this->assertCount(1, $this->getJson("/api/projects/{$this->project->id}/collectors/ids?q=Persona 17")->json());
    }

    public function test_existing_users_can_be_added_to_the_team(): void
    {
        $this->member('Ya en el equipo');
        $free = User::factory()->create(['rol' => User::ROLE_USER, 'name' => 'Libre Uno']);
        $other = User::factory()->create(['rol' => User::ROLE_USER, 'name' => 'Libre Dos']);
        User::factory()->create(['rol' => User::ROLE_USER, 'name' => 'Libre Inactivo', 'is_active' => false]);
        $leaderUser = User::factory()->create(['rol' => User::ROLE_PROJECT, 'name' => 'Libre Líder']);
        $url = "/api/projects/{$this->project->id}/collectors";

        $candidates = collect($this->getJson("{$url}/candidates?q=libre")->assertOk()->json())->pluck('id');
        $this->assertEqualsCanonicalizing([$free->id, $other->id], $candidates->all());

        $this->postJson("{$url}/attach", ['user_ids' => [$leaderUser->id]])->assertStatus(422);
        $this->postJson("{$url}/attach", ['user_ids' => [$free->id, $other->id]])->assertOk()->assertJsonPath('added', 2);
        $this->postJson("{$url}/attach", ['user_ids' => [$free->id]])->assertStatus(422)
            ->assertJsonPath('message', 'Algunos usuarios ya pertenecen a este proyecto.');
        $this->assertSame(3, $this->project->collectors()->wherePivot('is_active', true)->count());
        $this->assertCount(0, $this->getJson("{$url}/candidates?q=libre")->json());
    }
}
