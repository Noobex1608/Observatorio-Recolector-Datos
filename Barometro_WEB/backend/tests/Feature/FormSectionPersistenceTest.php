<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\FormQuestion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FormSectionPersistenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_questions_can_persist_section_names(): void
    {
        $user = User::factory()->create();
        $form = Form::factory()->create([
            'user_id' => $user->id,
            'project_id' => $user->project_id ?? null,
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
