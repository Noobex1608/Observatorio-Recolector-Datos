<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Preguntas de texto con formato: se rechazan valores inválidos y se guardan normalizados. */
class TextFormatSubmissionTest extends TestCase
{
    use RefreshDatabase;

    private Form $form;

    private array $ids = [];

    protected function setUp(): void
    {
        parent::setUp();
        $leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $project = Project::create(['name' => 'Formatos', 'created_by' => $leader->id]);
        $project->leaders()->attach($leader->id);
        $this->form = Form::create([
            'title' => 'Registro', 'user_id' => $leader->id, 'project_id' => $project->id,
            'state' => 'DEPLOYED', 'link_uuid' => (string) Str::uuid(),
            'consent_text' => 'Acepto participar en este levantamiento.',
        ]);
        foreach (['email' => 'Correo', 'cedula_ec' => 'Cédula', 'telefono_ec' => 'Teléfono'] as $format => $label) {
            $this->ids[$format] = $this->form->questions()->create([
                'type' => 'TEXT', 'label' => $label, 'required' => false, 'order' => count($this->ids),
                'properties' => ['text_format' => $format],
            ])->id;
        }
    }

    private function submit(array $answers)
    {
        return $this->postJson("/api/forms/submit/{$this->form->link_uuid}", [
            'client_submission_id' => (string) Str::uuid(),
            'data' => ['_consentimiento_aceptado' => true, ...$answers],
        ]);
    }

    public function test_invalid_values_are_rejected_with_a_clear_message(): void
    {
        $this->submit([$this->ids['cedula_ec'] => '1710034066'])
            ->assertStatus(422)
            ->assertJsonPath('message', "'Cédula': La cédula no es válida: revise el último dígito.");
        $this->submit([$this->ids['email'] => 'ana@uleam'])->assertStatus(422);
        $this->submit([$this->ids['telefono_ec'] => '12345'])->assertStatus(422);
    }

    public function test_valid_values_are_stored_normalized(): void
    {
        $this->submit([
            $this->ids['email'] => ' Ana@ULEAM.edu.ec ',
            $this->ids['cedula_ec'] => '171003406-5',
            $this->ids['telefono_ec'] => '+593 99 123 4567',
        ])->assertCreated();

        $data = $this->form->responses()->firstOrFail()->data;
        $this->assertSame('ana@uleam.edu.ec', $data[$this->ids['email']]);
        $this->assertSame('1710034065', $data[$this->ids['cedula_ec']]);
        $this->assertSame('0991234567', $data[$this->ids['telefono_ec']]);
    }

    public function test_only_known_formats_can_be_configured(): void
    {
        $leader = User::find($this->form->user_id);
        $this->form->project->technicalSheet()->create([
            'description' => 'Ficha', 'start_date' => today()->toDateString(),
            'end_date' => today()->addMonth()->toDateString(), 'status' => 'VALIDATED',
        ]);
        $this->form->update(['state' => 'DRAFT']);
        Sanctum::actingAs($leader);
        $this->postJson("/api/forms/{$this->form->id}/questions", [
            'type' => 'TEXT', 'label' => 'Correo', 'properties' => ['text_format' => 'email'],
        ])->assertCreated();
        $this->postJson("/api/forms/{$this->form->id}/questions", [
            'type' => 'TEXT', 'label' => 'Pasaporte', 'properties' => ['text_format' => 'pasaporte'],
        ])->assertStatus(422);
    }
}
