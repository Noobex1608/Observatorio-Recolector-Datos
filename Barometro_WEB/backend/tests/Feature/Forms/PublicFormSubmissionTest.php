<?php

declare(strict_types=1);

namespace Tests\Feature\Forms;

use App\Models\Form;
use App\Models\FormQuestion;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PublicFormSubmissionTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_form_fetch_does_not_require_authentication(): void
    {
        $project = Project::factory()->create();
        $user = User::factory()->create();

        $form = Form::create([
            'id' => (string) Str::uuid(),
            'project_id' => $project->id,
            'user_id' => $user->id,
            'title' => 'Encuesta Pública',
            'status' => Form::STATUS_DEPLOYED,
            'link_uuid' => (string) Str::uuid(),
        ]);

        $response = $this->getJson('/api/forms/fetch/' . $form->link_uuid);

        $response->assertStatus(200)
            ->assertJsonPath('title', 'Encuesta Pública');
    }

    public function test_public_form_submission_succeeds_without_auth_header(): void
    {
        $project = Project::factory()->create();
        $user = User::factory()->create();

        $form = Form::create([
            'id' => (string) Str::uuid(),
            'project_id' => $project->id,
            'user_id' => $user->id,
            'title' => 'Encuesta de Satisfacción',
            'status' => Form::STATUS_DEPLOYED,
            'link_uuid' => (string) Str::uuid(),
        ]);

        FormQuestion::create([
            'id' => (string) Str::uuid(),
            'form_id' => $form->id,
            'type' => 'TEXT',
            'label' => '¿Cuál es su opinión?',
            'required' => false,
            'order' => 1,
        ]);

        $payload = [
            'data' => [
                'q1' => 'Excelente servicio',
            ],
        ];

        $response = $this->postJson('/api/forms/submit/' . $form->link_uuid, $payload);

        $response->assertStatus(201)
            ->assertJsonPath('success', true);
    }
}
