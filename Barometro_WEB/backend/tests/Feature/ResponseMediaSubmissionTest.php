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
        $payload = ['data' => ['_consentimiento_aceptado' => true, $question->id => $this->imageAnswer()]];

        $first = $this->postJson('/api/forms/submit/'.$form->link_uuid, $payload)->assertCreated();
        $second = $this->postJson('/api/forms/submit/'.$form->link_uuid, $payload)->assertCreated();
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
        $payload = ['form_id' => $form->id, 'data' => [
            '_consentimiento_aceptado' => true, $question->id => $this->imageAnswer(),
        ]];

        $this->postJson('/api/mobile/submit', $payload)->assertCreated();
        $this->postJson('/api/mobile/submit', $payload)->assertStatus(422);
        $this->assertDatabaseCount('form_responses', 1);
        $this->assertCount(1, $this->media->objects);
    }
}
