<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\FormQuestion;
use App\Models\FormResponse;
use App\Models\Project;
use App\Models\ResponseSyncQueue;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MobileSubmitTest extends TestCase
{
    use RefreshDatabase;

    public function test_successful_submission_with_all_nine_kobotoolbox_question_types(): void
    {
        $user = User::factory()->create(['rol' => 'RECOLECTOR']);
        $project = Project::create(['name' => 'Proyecto Observatorio']);
        $form = Form::create([
            'title' => 'Encuesta KoboToolbox Completa',
            'description' => 'Evaluación de 9 nuevos tipos de preguntas',
            'user_id' => $user->id,
            'project_id' => $project->id,
            'state' => 'DEPLOYED',
            'link_uuid' => (string) Str::uuid(),
        ]);

        $qNote = $form->questions()->create([
            'type' => 'NOTE',
            'label' => 'Nota Informativa',
            'required' => true,
            'order' => 1,
        ]);

        $qDate = $form->questions()->create([
            'type' => 'DATE',
            'label' => 'Fecha de Nacimiento',
            'required' => true,
            'order' => 2,
        ]);

        $qTime = $form->questions()->create([
            'type' => 'TIME',
            'label' => 'Hora de Encuesta',
            'required' => true,
            'order' => 3,
        ]);

        $qDateTime = $form->questions()->create([
            'type' => 'DATETIME',
            'label' => 'Marca de Tiempo ISO',
            'required' => true,
            'order' => 4,
        ]);

        $qGps = $form->questions()->create([
            'type' => 'GPS',
            'label' => 'Coordenadas Geográficas',
            'required' => true,
            'order' => 5,
        ]);

        $qMultimedia = $form->questions()->create([
            'type' => 'MULTIMEDIA',
            'label' => 'Foto de Evidencia',
            'required' => true,
            'order' => 6,
        ]);

        $qSignature = $form->questions()->create([
            'type' => 'SIGNATURE',
            'label' => 'Firma del Encuestado',
            'required' => true,
            'order' => 7,
        ]);

        $qRanking = $form->questions()->create([
            'type' => 'RANKING',
            'label' => 'Prioridades de Inversión',
            'required' => true,
            'order' => 8,
            'options' => ['Educación', 'Salud', 'Infraestructura'],
        ]);

        $qRating = $form->questions()->create([
            'type' => 'RATING',
            'label' => 'Calificación del Servicio',
            'required' => true,
            'order' => 9,
            'options' => ['1', '2', '3', '4', '5'],
        ]);

        $qBarcode = $form->questions()->create([
            'type' => 'BARCODE',
            'label' => 'Código de Barras / QR',
            'required' => true,
            'order' => 10,
        ]);

        $qCalculate = $form->questions()->create([
            'type' => 'CALCULATE',
            'label' => 'Puntuación Calculada',
            'required' => false,
            'order' => 11,
        ]);

        $payload = [
            'form_id' => $form->id,
            'data' => [
                $qNote->id => null,
                $qDate->id => '2026-09-18',
                $qTime->id => '14:30:00',
                $qDateTime->id => '2026-09-18T14:30:00Z',
                $qGps->id => [
                    'lat' => -1.02345,
                    'lng' => -80.45213,
                    'accuracy' => 10.5,
                ],
                $qMultimedia->id => [
                    'type' => 'image',
                    'dataUrl' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                ],
                $qSignature->id => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                $qRanking->id => ['Salud', 'Educación', 'Infraestructura'],
                $qRating->id => 5,
                $qBarcode->id => '7891234567890',
                $qCalculate->id => 98.6,
            ],
        ];

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/mobile/submit', $payload);

        $response->assertStatus(201)
            ->assertJsonStructure(['message', 'id']);

        $responseId = $response->json('id');

        $this->assertDatabaseHas('form_responses', [
            'id' => $responseId,
            'form_id' => $form->id,
            'user_id' => $user->id,
        ]);

        $savedResponse = FormResponse::find($responseId);
        $this->assertNotNull($savedResponse);
        $this->assertEquals(-1.02345, $savedResponse->data[$qGps->id]['lat']);
        $this->assertEquals('2026-09-18', $savedResponse->data[$qDate->id]);
        $this->assertEquals(5, $savedResponse->data[$qRating->id]);

        $this->assertDatabaseHas('response_sync_queue', [
            'form_response_id' => $responseId,
            'form_id' => $form->id,
            'status' => 'pending',
        ]);
    }

    public function test_returns_422_when_required_gps_date_or_rating_is_invalid(): void
    {
        $user = User::factory()->create(['rol' => 'RECOLECTOR']);
        $project = Project::create(['name' => 'Proyecto Pruebas Validacion']);
        $form = Form::create([
            'title' => 'Formulario con Validaciones Erróneas',
            'user_id' => $user->id,
            'project_id' => $project->id,
            'state' => 'DEPLOYED',
            'link_uuid' => (string) Str::uuid(),
        ]);

        $qGps = $form->questions()->create([
            'type' => 'GPS',
            'label' => 'Ubicación GPS',
            'required' => true,
            'order' => 1,
        ]);

        $qDate = $form->questions()->create([
            'type' => 'DATE',
            'label' => 'Fecha Inválida',
            'required' => true,
            'order' => 2,
        ]);

        $qRating = $form->questions()->create([
            'type' => 'RATING',
            'label' => 'Puntuación Fuera de Rango',
            'required' => true,
            'order' => 3,
            'options' => ['1', '2', '3', '4', '5'],
        ]);

        $payload = [
            'form_id' => $form->id,
            'data' => [
                $qGps->id => ['lat' => 150.00, 'lng' => -80.00], // Latitud fuera de (-90, 90)
                $qDate->id => '2026-15-40',                     // Fecha inválida
                $qRating->id => 99,                             // RATING mayor que el máximo de 5
            ],
        ];

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/mobile/submit', $payload);

        $response->assertStatus(422)
            ->assertJsonValidationErrors([
                "data.{$qGps->id}",
                "data.{$qDate->id}",
                "data.{$qRating->id}",
            ]);
    }

    public function test_omits_blocking_validation_for_note_question_type(): void
    {
        $user = User::factory()->create(['rol' => 'RECOLECTOR']);
        $project = Project::create(['name' => 'Proyecto Nota Informativa']);
        $form = Form::create([
            'title' => 'Formulario con Nota',
            'user_id' => $user->id,
            'project_id' => $project->id,
            'state' => 'DEPLOYED',
            'link_uuid' => (string) Str::uuid(),
        ]);

        $qNote = $form->questions()->create([
            'type' => 'NOTE',
            'label' => 'Nota Informativa Importante',
            'required' => true, // Debe ser ignorado por el validador
            'order' => 1,
        ]);

        $qBarcode = $form->questions()->create([
            'type' => 'BARCODE',
            'label' => 'Código de Barras Opcional',
            'required' => false,
            'order' => 2,
        ]);

        $payload = [
            'form_id' => $form->id,
            'data' => [
                $qNote->id => null, // Omitido / nulo
            ],
        ];

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/mobile/submit', $payload);

        $response->assertStatus(201)
            ->assertJsonStructure(['message', 'id']);
    }
}
