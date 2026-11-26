<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Application\Responses\Contracts\ResponseMediaStorage;
use App\Models\Form;
use App\Models\FormResponse;
use App\Models\FormUserShare;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Fakes\InMemoryResponseMediaStorage;
use Tests\TestCase;

class ResponseMediaSubmissionTest extends TestCase
{
    use RefreshDatabase;

    private InMemoryResponseMediaStorage $media;

    protected function setUp(): void
    {
        parent::setUp();
        $this->media = new InMemoryResponseMediaStorage;
        $this->app->instance(ResponseMediaStorage::class, $this->media);
    }

    private function formWithImageQuestion(): array
    {
        $owner = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $project = Project::create(['name' => 'Proyecto multimedia']);
        $form = Form::create([
            'project_id' => $project->id,
            'user_id' => $owner->id,
            'title' => 'Encuesta con foto',
            'state' => 'DEPLOYED',
            'link_uuid' => (string) Str::uuid(),
        ]);
        $question = $form->questions()->create([
            'type' => 'MULTIMEDIA', 'label' => 'Fotografía', 'order' => 1, 'required' => true,
        ]);

        return [$form, $question, $owner];
    }

    private function imageAnswer(): array
    {
        return [
            'mediaType' => 'IMAGE',
            'dataUrl' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'fileName' => 'foto.png',
        ];
    }

    public function test_new_media_are_private_referenced_and_get_temporary_url_only_after_authorization(): void
    {
        [$form, $question, $owner] = $this->formWithImageQuestion();
        $payload = ['client_submission_id' => (string) \Illuminate\Support\Str::uuid(), 'data' => ['_consentimiento_aceptado' => true, $question->id => $this->imageAnswer()]];

        $first = $this->postJson('/api/forms/submit/'.$form->link_uuid, array_merge($payload, ['client_submission_id' => (string) \Illuminate\Support\Str::uuid()]))->assertCreated();
        $second = $this->postJson('/api/forms/submit/'.$form->link_uuid, array_merge($payload, ['client_submission_id' => (string) \Illuminate\Support\Str::uuid()]))->assertCreated();
        $saved = FormResponse::whereIn('id', [$first->json('id'), $second->json('id')])->get();
        $this->assertCount(2, $saved);
        $paths = $saved->map(fn ($response) => $response->data[$question->id]['path'])->all();
        $this->assertCount(2, array_unique($paths));
        $this->assertCount(2, $this->media->objects);
        foreach ($saved as $response) {
            $this->assertArrayNotHasKey('dataUrl', $response->data[$question->id]);
            $this->assertArrayNotHasKey('url', $response->data[$question->id]);
        }

        $url = "/api/forms/{$form->id}/responses/{$first->json('id')}/media/{$question->id}";
        $this->getJson($url)->assertUnauthorized();
        Sanctum::actingAs($owner);
        $this->getJson($url)->assertOk()->assertJsonPath('expires_in', 300);
    }

    public function test_storage_failure_never_persists_base64_or_a_response(): void
    {
        [$form, $question] = $this->formWithImageQuestion();
        $this->media->failUpload = true;
        $this->postJson('/api/forms/submit/'.$form->link_uuid, [
            'client_submission_id' => (string) \Illuminate\Support\Str::uuid(),
            'data' => ['_consentimiento_aceptado' => true, $question->id => $this->imageAnswer()],
        ])->assertStatus(503);
        $this->assertDatabaseCount('form_responses', 0);
        $this->assertSame([], $this->media->objects);
    }

    public function test_quota_rejection_cleans_up_media_uploaded_for_rejected_submission(): void
    {
        [$form, $question] = $this->formWithImageQuestion();
        $collector = User::factory()->create(['rol' => User::ROLE_USER]);
        FormUserShare::create([
            'form_id' => $form->id, 'user_id' => $collector->id,
            'role' => 'RECOLECTOR', 'target_responses' => 1,
        ]);
        Sanctum::actingAs($collector);
        $payload = ['client_submission_id' => (string) \Illuminate\Support\Str::uuid(), 'form_id' => $form->id, 'data' => [
            '_consentimiento_aceptado' => true, $question->id => $this->imageAnswer(),
        ]];

        $this->postJson('/api/mobile/submit', array_merge($payload, ['client_submission_id' => (string) \Illuminate\Support\Str::uuid()]))->assertCreated();
        $this->postJson('/api/mobile/submit', array_merge($payload, ['client_submission_id' => (string) \Illuminate\Support\Str::uuid()]))->assertStatus(422);
        $this->assertDatabaseCount('form_responses', 1);
        $this->assertCount(1, $this->media->objects);
    }

    public function test_media_upload_happens_before_the_form_row_is_locked(): void
    {
        [$form, $question] = $this->formWithImageQuestion();
        $baseline = \Illuminate\Support\Facades\DB::transactionLevel();
        $levels = [];
        $this->media->onUpload = function () use (&$levels) {
            $levels[] = \Illuminate\Support\Facades\DB::transactionLevel();
        };

        $this->postJson('/api/forms/submit/'.$form->link_uuid, [
            'client_submission_id' => (string) Str::uuid(),
            'data' => ['_consentimiento_aceptado' => true, $question->id => $this->imageAnswer()],
        ])->assertCreated();

        // Sin transacción propia: la fila del formulario no está bloqueada mientras se sube a SharePoint.
        $this->assertSame([$baseline], $levels);
    }

    public function test_retried_submission_does_not_upload_the_media_again(): void
    {
        [$form, $question] = $this->formWithImageQuestion();
        $payload = ['client_submission_id' => (string) Str::uuid(), 'data' => ['_consentimiento_aceptado' => true, $question->id => $this->imageAnswer()]];

        $first = $this->postJson('/api/forms/submit/'.$form->link_uuid, $payload)->assertCreated();
        $this->postJson('/api/forms/submit/'.$form->link_uuid, $payload)->assertCreated()->assertJsonPath('id', $first->json('id'));

        $this->assertCount(1, $this->media->objects);
        $this->assertDatabaseCount('form_responses', 1);
    }

    public function test_quota_reached_while_uploading_rejects_and_deletes_the_uploaded_media(): void
    {
        [$form, $question] = $this->formWithImageQuestion();
        $collector = User::factory()->create(['rol' => User::ROLE_USER]);
        FormUserShare::create(['form_id' => $form->id, 'user_id' => $collector->id, 'role' => 'RECOLECTOR', 'target_responses' => 1]);
        Sanctum::actingAs($collector);
        // Mientras se sube la foto, otro teléfono del mismo encuestador completa su meta.
        $this->media->onUpload = function () use ($form, $collector) {
            $this->media->onUpload = null;
            FormResponse::create(['form_id' => $form->id, 'user_id' => $collector->id, 'data' => [],
                'client_submission_id' => (string) Str::uuid(), 'submission_hash' => str_repeat('0', 64)]);
        };

        $this->postJson('/api/mobile/submit', [
            'client_submission_id' => (string) Str::uuid(), 'form_id' => $form->id,
            'data' => ['_consentimiento_aceptado' => true, $question->id => $this->imageAnswer()],
        ])->assertStatus(422);

        $this->assertDatabaseCount('form_responses', 1);
        $this->assertSame([], $this->media->objects);
    }
}
