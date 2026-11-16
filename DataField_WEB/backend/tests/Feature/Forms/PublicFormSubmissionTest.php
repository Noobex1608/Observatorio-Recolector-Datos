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
        $project = Project::create(['name' => 'Proyecto público']);
        $user = User::factory()->create();

        $form = Form::create([
            'id' => (string) Str::uuid(),
            'project_id' => $project->id,
            'user_id' => $user->id,
            'title' => 'Encuesta Pública',
            'state' => 'DEPLOYED',
            'link_uuid' => (string) Str::uuid(),
        ]);

        $response = $this->getJson('/api/forms/fetch/'.$form->link_uuid);

        $response->assertStatus(200)
            ->assertJsonPath('title', 'Encuesta Pública');
    }

    public function test_scheduled_form_shows_opening_date_without_exposing_questions_or_accepting_responses(): void
    {
        $project = Project::create(['name' => 'Proyecto programado']);
        $user = User::factory()->create();
        $startDate = today('America/Guayaquil')->addDays(5)->format('Y-m-d');
        $form = Form::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'title' => 'Encuesta futura',
            'state' => 'DEPLOYED',
            'link_uuid' => (string) Str::uuid(),
            'start_date' => $startDate,
            'end_date' => today('America/Guayaquil')->addDays(6)->format('Y-m-d'),
        ]);
        FormQuestion::create([
            'form_id' => $form->id, 'type' => 'TEXT', 'label' => 'Pregunta reservada',
            'required' => false, 'order' => 1,
        ]);

        $this->getJson('/api/forms/fetch/'.$form->link_uuid)
            ->assertOk()
            ->assertJsonPath('availability', 'SCHEDULED')
            ->assertJsonPath('start_date', $startDate)
            ->assertJsonMissingPath('questions');
        $this->postJson('/api/forms/submit/'.$form->link_uuid, [
            'client_submission_id' => (string) Str::uuid(),
            'data' => ['_consentimiento_aceptado' => true],
        ])->assertUnprocessable()->assertJsonValidationErrors('form_id');
    }

    public function test_public_form_submission_succeeds_without_auth_header(): void
    {
        $project = Project::create(['name' => 'Proyecto público']);
        $user = User::factory()->create();

        $form = Form::create([
            'id' => (string) Str::uuid(),
            'project_id' => $project->id,
            'user_id' => $user->id,
            'title' => 'Encuesta de Satisfacción',
            'state' => 'DEPLOYED',
            'link_uuid' => (string) Str::uuid(),
        ]);

        $question = FormQuestion::create([
            'id' => (string) Str::uuid(),
            'form_id' => $form->id,
            'type' => 'TEXT',
            'label' => '¿Cuál es su opinión?',
            'required' => false,
            'order' => 1,
        ]);

        $payload = ['client_submission_id' => (string) \Illuminate\Support\Str::uuid(),
            'data' => [
                '_consentimiento_aceptado' => true,
                $question->id => 'Excelente servicio',
            ],
        ];

        $response = $this->postJson('/api/forms/submit/'.$form->link_uuid, $payload);

        $response->assertStatus(201)
            ->assertJsonPath('message', 'Respuesta guardada');
    }
}
