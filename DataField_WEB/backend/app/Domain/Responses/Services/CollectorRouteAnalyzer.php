<?php

declare(strict_types=1);

namespace App\Domain\Responses\Services;

use App\Domain\Projects\Services\ProjectGeofenceVerifier;
use App\Models\FormResponse;
use App\Models\ProjectZone;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Convierte el trazado GPS de cada encuesta en un recorrido revisable: puntos marcados dentro/fuera
 * de la zona, distancia, duración y alertas de calidad para el supervisor.
 */
class CollectorRouteAnalyzer
{
    /** Lecturas con más error que esto no cuentan para distancia ni para decidir si salió de la zona. */
    public const MAX_ACCURACY_METERS = 100;

    public const MIN_DURATION_SECONDS = 120;

    public const MAX_DISTANCE_METERS = 300;

    public const POOR_ACCURACY_METERS = 50;

    public function __construct(private readonly ProjectGeofenceVerifier $geofence) {}

    /**
     * @param  Collection<string, ProjectZone>  $zones  Zonas por id.
     * @param  Collection<string, string>  $formTitles  Títulos por id de formulario.
     */
    public function survey(FormResponse $response, Collection $zones, Collection $formTitles): array
    {
        $data = is_array($response->data) ? $response->data : [];
        $geofence = is_array($data['_project_geofence'] ?? null) ? $data['_project_geofence'] : [];
        $zone = is_string($geofence['zone_id'] ?? null) ? $zones->get($geofence['zone_id']) : null;
        $trace = is_array($response->location_trace) ? $response->location_trace : null;
        $raw = $trace['points'] ?? [];
        if ($raw === [] && is_numeric($geofence['latitud'] ?? null) && is_numeric($geofence['longitud'] ?? null)) {
            // Respuestas sin trazado (versiones anteriores de la app): se usa la ubicación de la verificación zonal.
            $at = isset($geofence['timestamp']) ? strtotime((string) $geofence['timestamp']) : false;
            $raw = [[(float) $geofence['latitud'], (float) $geofence['longitud'],
                is_numeric($geofence['precision'] ?? null) ? (float) $geofence['precision'] : null,
                $at ?: $response->created_at->getTimestamp()]];
        }

        $points = [];
        foreach ($raw as $rawPoint) {
            [$lat, $lng, $accuracy, $time] = $rawPoint;
            $reliable = $accuracy === null || $accuracy <= self::MAX_ACCURACY_METERS;
            $points[] = [
                'lat' => (float) $lat, 'lng' => (float) $lng,
                'accuracy' => $accuracy !== null ? (float) $accuracy : null,
                'at' => CarbonImmutable::createFromTimestampUTC((int) $time)->toIso8601String(),
                'inside' => $zone ? $this->geofence->contains($zone, (float) $lat, (float) $lng) : null,
                'reliable' => $reliable,
                'event' => $rawPoint[4] ?? ($trace ? null : 'inicio'),
            ];
        }

        $reliable = array_values(array_filter($points, fn ($p) => $p['reliable']));
        $distance = 0.0;
        for ($i = 1; $i < count($reliable); $i++) {
            $distance += $this->meters($reliable[$i - 1], $reliable[$i]);
        }
        $checked = array_values(array_filter($reliable, fn ($p) => $p['inside'] !== null));
        $insideCount = count(array_filter($checked, fn ($p) => $p['inside']));
        $accuracies = array_values(array_filter(array_column($points, 'accuracy'), fn ($a) => $a !== null));

        $startedAt = $trace['started_at'] ?? ($points[0]['at'] ?? $response->created_at->toIso8601String());
        $endedAt = $trace['ended_at'] ?? ($points ? end($points)['at'] : null);
        $duration = $trace && $startedAt && $endedAt
            ? max(0, CarbonImmutable::parse($endedAt)->getTimestamp() - CarbonImmutable::parse($startedAt)->getTimestamp())
            : null;

        $first = $checked[0] ?? null;
        $last = $checked ? end($checked) : null;
        $summary = [
            'points' => count($points),
            'distance_meters' => (int) round($distance),
            'duration_seconds' => $duration,
            'inside_ratio' => $checked ? round($insideCount / count($checked), 3) : null,
            'start_inside' => $first['inside'] ?? null,
            'end_inside' => $last['inside'] ?? null,
            'average_accuracy' => $accuracies ? round(array_sum($accuracies) / count($accuracies), 1) : null,
        ];

        return [
            'id' => $response->id,
            'form_id' => $response->form_id,
            'form_title' => $formTitles->get($response->form_id),
            'zone' => $zone ? ['id' => $zone->id, 'name' => $zone->name] : null,
            'started_at' => $startedAt,
            'ended_at' => $endedAt,
            'received_at' => $response->created_at->toIso8601String(),
            'has_trace' => $trace !== null && ($trace['points'] ?? []) !== [],
            'declared_outside' => ($geofence['fuera_de_zona'] ?? false) === true,
            'justification' => is_string($geofence['justificacion'] ?? null) ? $geofence['justificacion'] : null,
            'summary' => $summary,
            'alerts' => $this->alerts($summary, $points, $trace, $geofence),
            'resumed' => count(array_filter($points, fn ($p) => $p['event'] === 'reanudar')),
            'path' => array_map(fn ($p) => [$p['lat'], $p['lng'], $p['accuracy'], $p['at'], $p['inside'], $p['reliable'], $p['event']], $points),
        ];
    }

    /** @param  list<array>  $surveys */
    public function day(array $surveys): array
    {
        $checked = 0;
        $inside = 0;
        foreach ($surveys as $survey) {
            $ratio = $survey['summary']['inside_ratio'];
            $points = $survey['summary']['points'];
            if ($ratio !== null && $points > 0) {
                $checked += $points;
                $inside += $ratio * $points;
            }
        }
        $durations = array_filter(array_map(fn ($s) => $s['summary']['duration_seconds'], $surveys), fn ($d) => $d !== null);

        return [
            'surveys' => count($surveys),
            'with_trace' => count(array_filter($surveys, fn ($s) => $s['has_trace'])),
            'first_start' => $surveys[0]['started_at'] ?? null,
            'last_end' => $surveys ? (end($surveys)['ended_at'] ?? end($surveys)['started_at']) : null,
            'distance_meters' => array_sum(array_map(fn ($s) => $s['summary']['distance_meters'], $surveys)),
            'surveying_seconds' => array_sum($durations),
            'inside_ratio' => $checked > 0 ? round($inside / $checked, 3) : null,
            'alerts' => array_sum(array_map(fn ($s) => count($s['alerts']), $surveys)),
            'outside_surveys' => count(array_filter($surveys, fn ($s) => $s['declared_outside'] || $s['summary']['end_inside'] === false)),
        ];
    }

    private function alerts(array $summary, array $points, ?array $trace, array $geofence): array
    {
        $alerts = [];
        if (! $trace || ($trace['points'] ?? []) === []) {
            $alerts[] = ['code' => 'sin_trazado', 'message' => 'Sin trazado GPS: solo se conoce el punto de la verificación zonal.'];
        }
        if (($geofence['fuera_de_zona'] ?? false) === true) {
            $alerts[] = ['code' => 'excepcion_zona', 'message' => 'El encuestador registró que estaba fuera de la zona.'];
        } elseif ($summary['start_inside'] === false || $summary['end_inside'] === false) {
            $alerts[] = ['code' => 'fuera_de_zona', 'message' => 'La encuesta empezó o terminó fuera de la zona asignada.'];
        } elseif ($summary['inside_ratio'] !== null && $summary['inside_ratio'] < 1) {
            $alerts[] = ['code' => 'salio_de_zona', 'message' => 'Parte del recorrido de la encuesta quedó fuera de la zona.'];
        }
        if ($summary['duration_seconds'] !== null && $summary['duration_seconds'] < self::MIN_DURATION_SECONDS) {
            $alerts[] = ['code' => 'duracion_corta', 'message' => 'La encuesta duró menos de 2 minutos.'];
        }
        if ($summary['distance_meters'] > self::MAX_DISTANCE_METERS) {
            $alerts[] = ['code' => 'desplazamiento', 'message' => "Hay {$summary['distance_meters']} m entre los puntos de la encuesta (inicio, reanudaciones y fin)."];
        }
        if ($summary['average_accuracy'] !== null && $summary['average_accuracy'] > self::POOR_ACCURACY_METERS) {
            $alerts[] = ['code' => 'gps_impreciso', 'message' => "Precisión GPS baja (±{$summary['average_accuracy']} m de promedio)."];
        }

        return $alerts;
    }

    private function meters(array $a, array $b): float
    {
        $lat1 = deg2rad($a['lat']);
        $lat2 = deg2rad($b['lat']);
        $h = sin(($lat2 - $lat1) / 2) ** 2 + cos($lat1) * cos($lat2) * sin(deg2rad($b['lng'] - $a['lng']) / 2) ** 2;

        return 2 * 6371000.0 * asin(min(1.0, sqrt($h)));
    }
}
