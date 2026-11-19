<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Form;
use App\Models\FormResponse;
use App\Models\Project;
use App\Models\ProjectZone;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Centro de datos: papelera y correcciones de respuestas sin entrar a la base de datos. */
class DataCenterTest extends TestCase
{
    use RefreshDatabase;

    private User $super;

    protected function setUp(): void
    {
        parent::setUp();
        $this->super = User::factory()->create(['rol' => User::ROLE_SUPER_ADMIN]);
        Sanctum::actingAs($this->super);
    }

    /** @return array{0:Form, 1:FormResponse, 2:array<string,string>} */
    private function formWithResponse(): array
    {
        $project = Project::create(['name' => 'Hogares']);
        $form = Form::create(['project_id' => $project->id, 'user_id' => $this->super->id, 'title' => 'Encuesta', 'state' => 'DEPLOYED', 'link_uuid' => (string) Str::uuid()]);
        $q = fn (array $data) => $form->questions()->create($data + ['required' => false])->id;
        $ids = [
            'prov' => $q(['type' => 'SINGLE_CHOICE', 'label' => 'Provincia', 'order' => 1, 'required' => true, 'options' => ['Manabí', 'Guayas']]),
            'edad' => $q(['type' => 'NUMBER', 'label' => 'Edad', 'order' => 3]),
            'foto' => $q(['type' => 'MULTIMEDIA', 'label' => 'Foto', 'order' => 5]),
        ];
        $ids['canton'] = $q(['type' => 'SINGLE_CHOICE', 'label' => 'Cantón', 'order' => 2, 'options' => ['Manta', 'Guayaquil'],
            'properties' => ['choice_filter' => ['question_id' => $ids['prov'], 'parents' => [['Manabí'], ['Guayas']]]]]);
        $ids['doble'] = $q(['type' => 'CALCULATE', 'label' => 'Doble', 'order' => 4, 'properties' => ['expression' => '${'.$ids['edad'].'} * 2']]);
        $response = FormResponse::create(['form_id' => $form->id, 'user_id' => null, 'data' => [
            $ids['prov'] => 'Manabí', $ids['canton'] => 'Manta', $ids['edad'] => 30, $ids['doble'] => 60,
        ]]);

        return [$form, $response, $ids];
    }

    public function test_only_the_super_admin_uses_the_data_center(): void
    {
        [, $response] = $this->formWithResponse();
        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_ADMIN]));

        $this->getJson('/api/data-center/trash/forms')->assertForbidden();
        $this->postJson("/api/data-center/responses/{$response->id}/void", ['reason' => 'Prueba duplicada'])->assertForbidden();
        $this->getJson('/api/data-center/trash/unknown')->assertForbidden();
    }

    public function test_correcting_an_answer_validates_keeps_history_prunes_cascades_and_recalculates(): void
    {
        [$form, $response, $ids] = $this->formWithResponse();
        $url = "/api/data-center/responses/{$response->id}/answer";

        $this->patchJson($url, ['question_id' => $ids['edad'], 'value' => 31])->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->patchJson($url, ['question_id' => $ids['prov'], 'value' => 'Los Ríos', 'reason' => 'Error de digitación'])
            ->assertUnprocessable()->assertJsonValidationErrors("data.{$ids['prov']}");
        $this->patchJson($url, ['question_id' => $ids['prov'], 'value' => null, 'reason' => 'Error de digitación'])->assertUnprocessable();
        $this->patchJson($url, ['question_id' => $ids['foto'], 'value' => 'x', 'reason' => 'Error de digitación'])->assertUnprocessable();

        // El número recalcula el campo calculado.
        $this->patchJson($url, ['question_id' => $ids['edad'], 'value' => 31, 'reason' => 'El encuestado corrigió su edad'])->assertOk();
        $this->assertSame(62, (int) $response->fresh()->data[$ids['doble']]);

        // Cambiar la provincia vacía el cantón que ya no le corresponde.
        $this->patchJson($url, ['question_id' => $ids['prov'], 'value' => 'Guayas', 'reason' => 'Provincia mal marcada'])
            ->assertOk()->assertJsonPath('data.corrections.1.cleared.0.question', 'Cantón');
        $data = $response->fresh()->data;
        $this->assertSame('Guayas', $data[$ids['prov']]);
        $this->assertArrayNotHasKey($ids['canton'], $data);
        $this->patchJson($url, ['question_id' => $ids['canton'], 'value' => 'Manta', 'reason' => 'Cantón correcto'])
            ->assertUnprocessable()->assertJsonValidationErrors("data.{$ids['canton']}");
        $this->patchJson($url, ['question_id' => $ids['canton'], 'value' => 'Guayaquil', 'reason' => 'Cantón correcto'])->assertOk();

        $history = $response->fresh()->corrections;
        $this->assertCount(3, $history);
        $this->assertSame(['answer', 30, 31, 'El encuestado corrigió su edad', $this->super->name],
            [$history[0]['type'], $history[0]['before'], $history[0]['after'], $history[0]['reason'], $history[0]['by']]);
        $this->assertSame(3, AuditLog::where('action', 'CORRECT_RESPONSE')->count());
    }

    public function test_voided_responses_leave_lists_and_counts_and_can_be_restored(): void
    {
        [$form, $response] = $this->formWithResponse();

        $this->postJson("/api/data-center/responses/{$response->id}/void", ['reason' => 'Encuesta de prueba'])->assertOk();
        $this->assertSoftDeleted($response);
        $this->getJson("/api/forms/{$form->id}/responses")->assertOk()->assertJsonPath('pagination.total', 0);
        $this->getJson('/api/data-center/trash/responses')->assertOk()
            ->assertJsonPath('data.0.reason', 'Encuesta de prueba')
            ->assertJsonPath('data.0.deleted_by', $this->super->name)
            ->assertJsonPath('data.0.can_purge', false);
        $this->deleteJson("/api/data-center/trash/responses/{$response->id}")->assertUnprocessable();

        $this->postJson("/api/data-center/trash/responses/{$response->id}/restore")->assertOk();
        $this->getJson("/api/forms/{$form->id}/responses")->assertOk()->assertJsonPath('pagination.total', 1);
        $this->assertSame(['void', 'restore'], array_column($response->fresh()->corrections, 'type'));
    }

    public function test_reassigning_the_collector_only_to_people_of_the_form_or_project(): void
    {
        [$form, $response] = $this->formWithResponse();
        $ana = User::factory()->create(['rol' => User::ROLE_USER]);
        $stranger = User::factory()->create(['rol' => User::ROLE_USER]);
        DB::table('project_collectors')->insert(['project_id' => $form->project_id, 'user_id' => $ana->id, 'created_at' => now(), 'updated_at' => now()]);

        $this->getJson("/api/data-center/responses/{$response->id}/collectors")->assertOk()->assertJsonPath('data.0.id', $ana->id);
        $this->patchJson("/api/data-center/responses/{$response->id}/collector", ['user_id' => $stranger->id, 'reason' => 'Se registró con otra cuenta'])
            ->assertUnprocessable();
        $this->patchJson("/api/data-center/responses/{$response->id}/collector", ['user_id' => $ana->id, 'reason' => 'Se registró con otra cuenta'])
            ->assertOk();
        $this->assertSame($ana->id, $response->fresh()->user_id);
    }

    public function test_purging_a_form_needs_its_exact_name_and_removes_its_files(): void
    {
        [$form, $response, $ids] = $this->formWithResponse();
        $response->update(['data' => $response->data + [$ids['foto'] => ['path' => 'responses/f/a.jpg', 'storage_driver' => 'sharepoint', 'mediaType' => 'IMAGE']]]);
        FormResponse::create(['form_id' => $form->id, 'data' => [$ids['foto'] => ['path' => 'responses/f/viejo.jpg']]])->delete();
        $deleted = new \ArrayObject;
        $this->app->bind('response-media.storage-for', fn () => fn (string $driver) => new class($driver, $deleted)
        {
            public function __construct(private string $driver, private \ArrayObject $deleted) {}

            public function delete(string $path): void
            {
                $this->deleted[] = "{$this->driver}:{$path}";
            }
        });
        $form->update(['state' => 'ARCHIVED']);
        $this->deleteJson("/api/forms/{$form->id}")->assertNoContent();

        // Antes de borrar se pueden exportar sus respuestas aunque esté en la papelera.
        $this->get("/api/forms/{$form->id}/export?format=csv")->assertOk();

        $this->deleteJson("/api/data-center/trash/forms/{$form->id}")->assertUnprocessable()
            ->assertJsonPath('message', 'Para eliminarlo definitivamente escribe el nombre exacto del formulario.');
        $this->deleteJson("/api/data-center/trash/forms/{$form->id}", ['confirm' => 'encuesta'])->assertUnprocessable();
        $this->assertDatabaseHas('forms', ['id' => $form->id]);

        $this->deleteJson("/api/data-center/trash/forms/{$form->id}", ['confirm' => ' Encuesta '])->assertOk()
            ->assertJsonPath('message', 'El formulario «Encuesta» eliminado definitivamente. Se borraron también sus 2 archivo(s).');
        $this->assertDatabaseMissing('forms', ['id' => $form->id]);
        $this->assertSame(0, FormResponse::withTrashed()->where('form_id', $form->id)->count());
        $this->assertEqualsCanonicalizing(['sharepoint:responses/f/a.jpg', 'supabase:responses/f/viejo.jpg'], $deleted->getArrayCopy());
        $this->assertSame(2, AuditLog::where('action', 'PURGE_FORM')->first()->metadata['responses'] ?? null);
    }

    public function test_deleted_projects_forms_and_zones_go_to_the_trash_and_come_back(): void
    {
        [$form] = $this->formWithResponse();
        $project = $form->project;
        $zone = ProjectZone::create(['project_id' => $project->id, 'form_id' => $form->id, 'name' => 'Centro', 'geofence_type' => 'CIRCLE',
            'target_lat' => -0.95, 'target_lng' => -80.7, 'radius_meters' => 200]);
        $form->update(['state' => 'ARCHIVED']);

        $this->deleteJson("/api/forms/{$form->id}")->assertNoContent();
        $this->assertSoftDeleted($form);
        $this->getJson("/api/forms/{$form->id}")->assertNotFound();
        $this->getJson('/api/data-center/trash/forms')->assertOk()
            ->assertJsonPath('data.0.name', 'Encuesta')->assertJsonPath('data.0.deleted_by', $this->super->name);

        // Proyecto sin formularios activos: también va a la papelera.
        $this->deleteJson("/api/projects/{$project->id}")->assertNoContent();
        $this->postJson("/api/data-center/trash/forms/{$form->id}/restore")->assertUnprocessable()
            ->assertJsonPath('message', 'Su proyecto está en la papelera: restaura primero el proyecto.');
        $this->deleteJson("/api/data-center/trash/projects/{$project->id}")->assertUnprocessable();

        $this->postJson("/api/data-center/trash/projects/{$project->id}/restore")->assertOk();
        $this->postJson("/api/data-center/trash/forms/{$form->id}/restore")->assertOk();
        $this->assertNull($form->fresh()->deleted_at);
        $this->assertNull($form->fresh()->deleted_by);
        $this->getJson("/api/forms/{$form->id}/responses")->assertOk()->assertJsonPath('pagination.total', 1);

        // Zona: se borra y se restaura; eliminación definitiva.
        $zone->delete();
        $this->postJson("/api/data-center/trash/zones/{$zone->id}/restore")->assertOk()->assertJsonPath('message', 'Zona «Centro» restaurada. Vuelve a asignarle encuestadores.');
        $zone->delete();
        $this->deleteJson("/api/data-center/trash/zones/{$zone->id}")->assertOk();
        $this->assertDatabaseMissing('project_zones', ['id' => $zone->id]);
    }
}
