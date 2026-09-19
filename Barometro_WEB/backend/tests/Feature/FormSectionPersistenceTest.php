<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\FormQuestion;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FormSectionPersistenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_questions_can_persist_section_names(): void
    {
        $user = User::factory()->create();
        $project = Project::create(['name' => 'Proyecto Demo']);
        $form = Form::create([
            'title' => 'Formulario Prueba',
            'user_id' => $user->id,
            'project_id' => $project->id,
            'state' => 'DRAFT',
        ]);

        $question = $form->questions()->create([
            'type' => 'TEXT',
            'label' => 'Pregunta de prueba',
            'order' => 0,
            'required' => true,
            'section_name' => 'Salud',
        ]);

        $this->assertSame('Salud', $question->fresh()->section_name);
    }
}
