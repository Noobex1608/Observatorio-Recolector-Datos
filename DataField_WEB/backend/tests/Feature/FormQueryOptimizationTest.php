<?php

namespace Tests\Feature;

use App\Domain\Forms\Services\FormLifecycleService;
use App\Models\Form;
use App\Models\FormResponse;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Cubre las optimizaciones del plan de mejoras (1.1 consultas agrupadas, 1.2 ciclo de vida
 * limitado a una vez por minuto, 1.3 estadísticas en PostgreSQL): mismas respuestas, menos consultas.
 */
class FormQueryOptimizationTest extends TestCase
{
    use RefreshDatabase;

    private function deployedForm(User $owner, string $title = 'Instrumento'): Form
    {
        $project = Project::create(['name' => 'Proyecto '.$title]);
        $project->leaders()->attach($owner);

        return Form::create([
            'title' => $title, 'user_id' => $owner->id, 'project_id' => $project->id,
            'state' => 'DEPLOYED', 'link_uuid' => (string) Str::uuid(),
        ]);
    }

    private function response(Form $form, ?User $user, array $data): FormResponse
    {
        return FormResponse::create([
            'form_id' => $form->id, 'user_id' => $user?->id, 'data' => $data,
            'client_submission_id' => (string) Str::uuid(), 'submission_hash' => hash('sha256', Str::uuid()),
        ]);
    }

    public function test_mobile_metadata_and_index_report_quota_progress_with_grouped_queries(): void
    {
        $owner = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $collector = User::factory()->create(['rol' => User::ROLE_USER]);
        $other = User::factory()->create(['rol' => User::ROLE_USER]);

        $forms = collect(range(1, 5))->map(fn ($i) => $this->deployedForm($owner, "Formulario {$i}"));
        foreach ($forms as $i => $form) {
            $form->shares()->create(['user_id' => $collector->id, 'role' => 'RECOLECTOR', 'target_responses' => 10 + $i]);
            $form->shares()->create(['user_id' => $other->id, 'role' => 'RECOLECTOR']);
            foreach (range(0, $i) as $_) {
                $this->response($form, $collector, ['x' => 1]);
            }
            $this->response($form, $other, ['x' => 1]);
        }

        Sanctum::actingAs($collector);
        DB::enableQueryLog();
        $metadata = $this->getJson('/api/mobile/forms/metadata')->assertOk()->json();
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertCount(5, $metadata);
        foreach ($forms as $i => $form) {
            $row = collect($metadata)->firstWhere('id', $form->id);
            $this->assertSame(10 + $i, $row['target_responses']);
            $this->assertSame($i + 1, $row['responses_count']);
        }
        // Antes: 2 consultas extra por formulario. Ahora el total no depende del número de formularios.
        $this->assertLessThanOrEqual(8, $queries);

        $index = $this->getJson('/api/mobile/forms')->assertOk()->json();
        $first = collect($index)->firstWhere('id', $forms[0]->id);
        $this->assertSame(10, $first['target_responses']);
        $this->assertSame(1, $first['responses_count']);

        $detail = $this->getJson('/api/forms/'.$forms[2]->id)->assertOk();
        $detail->assertJsonPath('target_responses', 12)->assertJsonPath('responses_count', 3);
    }

    public function test_unassigned_admin_gets_null_quota_like_before(): void
    {
        $owner = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $admin = User::factory()->create(['rol' => User::ROLE_ADMIN]);
        $form = $this->deployedForm($owner);

        Sanctum::actingAs($admin);
        $this->getJson('/api/mobile/forms/metadata')->assertOk()
            ->assertJsonPath('0.id', $form->id)
            ->assertJsonPath('0.target_responses', null)
            ->assertJsonPath('0.responses_count', null);
    }

    public function test_shares_list_counts_each_collector_and_shared_index_keeps_role_without_leaking_shares(): void
    {
        $owner = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $a = User::factory()->create(['rol' => User::ROLE_USER]);
        $b = User::factory()->create(['rol' => User::ROLE_USER]);
        $form = $this->deployedForm($owner);
        $form->shares()->create(['user_id' => $a->id, 'role' => 'RECOLECTOR', 'target_responses' => 5]);
        $form->shares()->create(['user_id' => $b->id, 'role' => 'RECOLECTOR']);
        $this->response($form, $a, ['x' => 1]);
        $this->response($form, $a, ['x' => 2]);

        Sanctum::actingAs($owner);
        $shares = collect($this->getJson("/api/forms/{$form->id}/shares")->assertOk()->json());
        $this->assertSame(2, $shares->firstWhere('user_id', $a->id)['responses_count']);
        $this->assertSame(0, $shares->firstWhere('user_id', $b->id)['responses_count']);

        Sanctum::actingAs($a);
        $this->getJson('/api/forms')->assertOk()
            ->assertJsonPath('shared_forms.0.id', $form->id)
            ->assertJsonPath('shared_forms.0.access_role', 'RECOLECTOR')
            ->assertJsonMissingPath('shared_forms.0.shares');
    }

    public function test_stats_count_single_multiple_and_likert_answers(): void
    {
        $owner = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $form = $this->deployedForm($owner);
        $single = $form->questions()->create(['type' => 'SINGLE_CHOICE', 'label' => 'Sexo', 'order' => 1, 'options' => ['Hombre', 'Mujer']]);
        $multi = $form->questions()->create(['type' => 'MULTIPLE_CHOICE', 'label' => 'Servicios', 'order' => 2, 'options' => ['Agua', 'Luz', 'Internet']]);
        $likert = $form->questions()->create(['type' => 'LIKERT', 'label' => 'Satisfacción', 'order' => 3,
            'options' => ['rows' => ['Salud', 'Educación'], 'columns' => ['Mala', 'Buena']]]);
        $text = $form->questions()->create(['type' => 'TEXT', 'label' => 'Comentario', 'order' => 4]);

        $this->response($form, null, [$single->id => 'Mujer', $multi->id => ['Agua', 'Luz'], $likert->id => ['Salud' => 'Buena', 'Educación' => 'Mala'], $text->id => 'Hola']);
        $this->response($form, null, [$single->id => 'Mujer', $multi->id => ['Agua', ''], $likert->id => ['Salud' => 'Buena', 'Educación' => '']]);
        $this->response($form, null, [$single->id => '', $multi->id => [['anidado']], 'otra_clave' => 'Mujer']);
        $this->response($form, null, [$single->id => 'Otro valor']);

        Sanctum::actingAs($owner);
        $stats = $this->getJson("/api/forms/{$form->id}/stats")->assertOk()->json();

        $this->assertEquals(['Hombre' => 0, 'Mujer' => 2, 'Otro valor' => 1], $stats[$single->id]);
        $this->assertEquals(['Agua' => 2, 'Luz' => 1, 'Internet' => 0], $stats[$multi->id]);
        $this->assertEquals(['Mala' => 1, 'Buena' => 2], $stats[$likert->id]);
        $this->assertArrayNotHasKey($text->id, $stats);
    }

    public function test_lifecycle_sync_from_requests_runs_at_most_once_per_minute(): void
    {
        $owner = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $expired = $this->deployedForm($owner, 'Vencido');
        $expired->update(['end_date' => now('America/Guayaquil')->subDays(2)->toDateString()]);

        Cache::forget('forms:lifecycle-sync');
        app(FormLifecycleService::class)->syncStatesIfDue();
        $this->assertSame('ARCHIVED', $expired->fresh()->state);

        $second = $this->deployedForm($owner, 'Vencido 2');
        $second->update(['end_date' => now('America/Guayaquil')->subDays(2)->toDateString()]);
        app(FormLifecycleService::class)->syncStatesIfDue();
        $this->assertSame('DEPLOYED', $second->fresh()->state, 'Dentro del mismo minuto no se vuelve a ejecutar.');

        $this->artisan('forms:update-lifecycle')->assertSuccessful();
        $this->assertSame('ARCHIVED', $second->fresh()->state, 'La tarea programada sigue archivando siempre.');
    }
}
