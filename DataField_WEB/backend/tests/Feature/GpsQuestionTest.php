<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Forms\Services\FormResponseValidator;
use App\Models\Form;
use App\Models\FormResponse;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Pregunta de tipo GPS: validación del punto capturado y columnas del exporte. */
class GpsQuestionTest extends TestCase
{
    use RefreshDatabase;

    private function gpsForm(User $owner): array
    {
        $project = Project::create(['name' => 'Proyecto GPS']);
        $form = Form::create([
            'project_id' => $project->id, 'user_id' => $owner->id,
            'title' => 'Encuesta con ubicación', 'state' => 'DEPLOYED',
        ]);
        $question = $form->questions()->create(['type' => 'GPS', 'label' => 'Ubicación', 'required' => true, 'order' => 1]);

        return [$form, $question];
    }

    public function test_validates_coordinate_ranges_and_accuracy(): void
    {
        [$form, $question] = $this->gpsForm(User::factory()->create(['rol' => User::ROLE_PROJECT]));
        $validator = new FormResponseValidator;
        $questions = $form->questions()->get();

        $validator->validate($questions, [$question->id => [
            'latitude' => -0.9538, 'longitude' => -80.7456, 'accuracy' => 12.5, 'timestamp' => '2026-11-17T15:00:00.000Z',
        ]]);
        $validator->validate($questions, [$question->id => ['lat' => -90, 'lng' => 180]]);

        foreach ([
            ['latitude' => 90.1, 'longitude' => 0],
            ['latitude' => 0, 'longitude' => -180.5],
            ['latitude' => 'abc', 'longitude' => 0],
            ['latitude' => 0, 'longitude' => 0, 'accuracy' => -1],
            '-0.95, -80.74',
        ] as $invalid) {
            try {
                $validator->validate($questions, [$question->id => $invalid]);
                $this->fail('Se aceptó un punto GPS inválido: '.json_encode($invalid));
            } catch (ValidationException $e) {
                $this->assertArrayHasKey("data.{$question->id}", $e->errors());
            }
        }

        $this->expectException(ValidationException::class);
        $validator->validate($questions, []);
    }

    public function test_export_splits_gps_answer_into_columns(): void
    {
        $owner = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        [$form, $question] = $this->gpsForm($owner);
        FormResponse::create(['form_id' => $form->id, 'user_id' => $owner->id, 'data' => [
            $question->id => [
                'latitude' => -0.9538, 'longitude' => -80.7456, 'altitude' => 12.3,
                'accuracy' => 8.5, 'timestamp' => '2026-11-17T15:00:00.000Z',
            ],
        ]]);
        Sanctum::actingAs($owner);

        $csv = $this->get("/api/forms/{$form->id}/export?format=csv")->assertOk()->streamedContent();
        $rows = array_map('str_getcsv', explode("\n", trim(preg_replace('/^\xEF\xBB\xBF/', '', $csv))));
        $record = array_combine($rows[0], $rows[1]);

        // El CSV antepone ' a los textos que empiezan con "-" (protección contra fórmulas).
        $this->assertSame("'-0.9538 -80.7456 12.3 8.5", $record['Ubicación']);
        $this->assertSame('-0.9538', $record['_Ubicación_latitude']);
        $this->assertSame('-80.7456', $record['_Ubicación_longitude']);
        $this->assertSame('12.3', $record['_Ubicación_altitude']);
        $this->assertSame('8.5', $record['_Ubicación_precision']);
        $this->assertSame('2026-11-17T15:00:00.000Z', $record['_Ubicación_captured_at']);
    }
}
