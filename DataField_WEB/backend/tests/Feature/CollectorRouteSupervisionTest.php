<?php

namespace Tests\Feature;

use App\Models\Form;
use App\Models\FormResponse;
use App\Models\Project;
use App\Models\ProjectZone;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Trazado GPS por encuesta y recorrido del encuestador en la pestaña Supervisión. */
class CollectorRouteSupervisionTest extends TestCase
{
    use RefreshDatabase;

    private User $leader;

    private User $collector;

    private Project $project;

    private Form $form;

    private ProjectZone $zone;

    protected function setUp(): void
    {
        parent::setUp();
        $this->leader = User::factory()->create(['rol' => User::ROLE_PROJECT]);
        $this->collector = User::factory()->create(['rol' => User::ROLE_USER, 'name' => 'Ana Campo']);
        $this->project = Project::create(['name' => 'Recorridos', 'created_by' => $this->leader->id]);
        $this->project->leaders()->attach($this->leader->id);
        $this->project->collectors()->attach($this->collector->id, ['is_active' => true]);
        $this->form = Form::create([
            'title' => 'Hogares', 'user_id' => $this->leader->id, 'project_id' => $this->project->id,
            'state' => 'DEPLOYED', 'link_uuid' => (string) Str::uuid(), 'instrument_locked' => true,
            'consent_text' => 'Acepto participar en este levantamiento.',
        ]);
        // Cuadrado de ~1 km alrededor de (-0.95, -80.72).
        $this->zone = ProjectZone::create([
            'project_id' => $this->project->id, 'form_id' => $this->form->id, 'name' => 'Centro',
            'geofence_type' => 'custom_polygon',
            'geometry_json' => ['type' => 'Polygon', 'coordinates' => [[
                [-80.725, -0.955], [-80.715, -0.955], [-80.715, -0.945], [-80.725, -0.945], [-80.725, -0.955],
            ]]],
        ]);
        $this->zone->assignedUsers()->attach($this->collector->id, ['role' => 'RECOLECTOR']);
        $this->form->shares()->create(['user_id' => $this->collector->id, 'role' => 'RECOLECTOR']);
    }

    private function trace(int $start, array $points, int $seconds): array
    {
        return [
            'started_at' => date(DATE_ATOM, $start), 'ended_at' => date(DATE_ATOM, $start + $seconds),
            'points' => array_map(fn ($p, $i) => [$p[0], $p[1], $p[2] ?? 8, ($start + $i * 20) * 1000,
                $i === 0 ? 'inicio' : ($i === count($points) - 1 ? 'fin' : 'reanudar')], $points, array_keys($points)),
        ];
    }

    private function submit(array $trace, array $geofence = []): string
    {
        $question = $this->form->questions()->firstOrCreate(['label' => 'Respuesta'], ['type' => 'TEXT', 'required' => true, 'order' => 1]);
        Sanctum::actingAs($this->collector);

        return $this->postJson('/api/mobile/submit', [
            'form_id' => $this->form->id, 'client_submission_id' => (string) Str::uuid(),
            'data' => [
                $question->id => 'Dato', '_consentimiento_aceptado' => true,
                '_project_geofence' => ['zone_id' => $this->zone->id, 'latitud' => -0.95, 'longitud' => -80.72, 'fuera_de_zona' => false, ...$geofence],
                '_location_trace' => $trace,
            ],
        ])->assertCreated()->json('id');
    }

    public function test_trace_is_stored_apart_from_the_answers_and_bad_points_are_dropped(): void
    {
        $start = now()->subMinutes(10)->getTimestamp();
        $trace = $this->trace($start, [[-0.95, -80.72], [-0.9501, -80.7201], [-0.9502, -80.7202]], 300);
        $trace['points'][] = ['x', 'y', 1, $start];
        $trace['points'][] = [95, -80.72, 5, $start * 1000];
        $trace['points'][] = [-0.95, -80.72, 5, (now()->addDay()->getTimestamp()) * 1000];

        $id = $this->submit($trace);

        $response = FormResponse::findOrFail($id);
        $this->assertArrayNotHasKey('_location_trace', $response->data);
        $this->assertCount(3, $response->location_trace['points']);
        $this->assertEquals([-0.95, -80.72, 8, $start, 'inicio'], $response->location_trace['points'][0]);
        $this->assertSame(['inicio', 'reanudar', 'fin'], array_column($response->location_trace['points'], 4));
        $this->assertSame($start, $response->trace_started_at->getTimestamp());
        $this->assertArrayNotHasKey('location_trace', $response->toArray());
    }

    public function test_supervisor_lists_collectors_and_reviews_the_route_against_the_zone(): void
    {
        $base = now('America/Guayaquil')->setTime(9, 0)->getTimestamp();
        if ($base > time()) {
            $base -= 86400;
        }
        // 1) Dentro de la zona, 5 minutos.
        $this->submit($this->trace($base, [[-0.95, -80.72], [-0.9502, -80.7203], [-0.9504, -80.7205]], 300));
        // 2) Sale de la zona a mitad de la encuesta y dura 1 minuto.
        $this->submit($this->trace($base + 1800, [[-0.95, -80.72], [-0.96, -80.72], [-0.9505, -80.7205]], 60));
        $supervisor = User::factory()->create(['rol' => User::ROLE_SUPERVISOR]);
        $this->project->supervisors()->attach($supervisor->id);

        Sanctum::actingAs(User::factory()->create(['rol' => User::ROLE_PROJECT]));
        $this->getJson("/api/projects/{$this->project->id}/supervision/collectors")->assertForbidden();

        Sanctum::actingAs($supervisor);
        $this->getJson("/api/projects/{$this->project->id}/supervision/collectors?q=Ana")->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('data.0.id', $this->collector->id)
            ->assertJsonPath('data.0.responses', 2)
            ->assertJsonPath('data.0.traced', 2)
            ->assertJsonPath('data.0.zones.0', 'Centro');

        $date = date('Y-m-d', $base - 5 * 3600);
        $route = $this->getJson("/api/projects/{$this->project->id}/supervision/collectors/{$this->collector->id}")
            ->assertOk()
            ->assertJsonPath('date', $date)
            ->assertJsonPath('days.0.surveys', 2)
            ->assertJsonPath('zones.0.name', 'Centro')
            ->assertJsonPath('summary.surveys', 2)
            ->json();

        [$first, $second] = $route['surveys'];
        $this->assertSame(1.0, (float) $first['summary']['inside_ratio']);
        $this->assertSame(300, $first['summary']['duration_seconds']);
        $this->assertSame([], $first['alerts']);
        $this->assertTrue($first['path'][0][4]);
        $this->assertSame('inicio', $first['path'][0][6]);
        $this->assertSame(1, $first['resumed']);

        $this->assertFalse($second['path'][1][4], 'El punto a ~1 km al sur queda fuera del polígono');
        $codes = array_column($second['alerts'], 'code');
        $this->assertContains('salio_de_zona', $codes);
        $this->assertContains('duracion_corta', $codes);
        $this->assertContains('desplazamiento', $codes);
        $this->assertGreaterThan(2000, $route['summary']['distance_meters']);

        $this->getJson("/api/projects/{$this->project->id}/supervision/collectors/{$this->collector->id}?date=2020-01-01")
            ->assertOk()->assertJsonPath('summary.surveys', 0);
        $outsider = User::factory()->create(['rol' => User::ROLE_USER]);
        $this->getJson("/api/projects/{$this->project->id}/supervision/collectors/{$outsider->id}")->assertNotFound();
    }

    public function test_older_responses_without_trace_fall_back_to_the_zone_check_point(): void
    {
        FormResponse::create([
            'form_id' => $this->form->id, 'user_id' => $this->collector->id,
            'client_submission_id' => (string) Str::uuid(), 'submission_hash' => hash('sha256', 'x'),
            'data' => ['_project_geofence' => ['zone_id' => $this->zone->id, 'latitud' => -0.95, 'longitud' => -80.72, 'precision' => 12]],
        ]);
        Sanctum::actingAs($this->leader);

        $survey = $this->getJson("/api/projects/{$this->project->id}/supervision/collectors/{$this->collector->id}")
            ->assertOk()->json('surveys.0');
        $this->assertFalse($survey['has_trace']);
        $this->assertCount(1, $survey['path']);
        $this->assertTrue($survey['path'][0][4]);
        $this->assertSame('sin_trazado', $survey['alerts'][0]['code']);
    }
}
