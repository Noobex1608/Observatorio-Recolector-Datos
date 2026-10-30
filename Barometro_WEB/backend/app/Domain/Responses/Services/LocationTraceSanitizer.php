<?php

declare(strict_types=1);

namespace App\Domain\Responses\Services;

use Carbon\CarbonImmutable;
use Throwable;

/**
 * Normaliza el trazado GPS de una encuesta: la app toma un punto al iniciarla, uno cada vez que se
 * retoma el borrador y uno al finalizarla.
 *
 * Formato guardado: ['started_at' => ISO, 'ended_at' => ISO, 'points' => [[lat, lng, precisión|null, epoch_seg, evento|null], ...]].
 * Los puntos inválidos se descartan en lugar de rechazar la encuesta: el trazado es evidencia de apoyo,
 * no debe impedir que una respuesta tomada sin conexión llegue al servidor.
 */
class LocationTraceSanitizer
{
    public const MAX_POINTS = 500;

    public const EVENTS = ['inicio', 'reanudar', 'fin'];

    private const MAX_AGE_DAYS = 120;

    public function sanitize(mixed $trace): ?array
    {
        if (! is_array($trace)) {
            return null;
        }
        $now = time();
        $min = $now - self::MAX_AGE_DAYS * 86400;
        $max = $now + 600;
        $points = [];
        foreach (array_slice(is_array($trace['points'] ?? null) ? $trace['points'] : [], 0, self::MAX_POINTS) as $point) {
            if (! is_array($point) || ! array_is_list($point) || count($point) < 4) {
                continue;
            }
            [$lat, $lng, $accuracy, $time] = $point;
            $event = in_array($point[4] ?? null, self::EVENTS, true) ? $point[4] : null;
            if (! $this->finite($lat) || ! $this->finite($lng) || ! $this->finite($time)) {
                continue;
            }
            $lat = (float) $lat;
            $lng = (float) $lng;
            $time = (int) ((float) $time > 1e11 ? (float) $time / 1000 : (float) $time);
            if (abs($lat) > 90 || abs($lng) > 180 || ($lat == 0.0 && $lng == 0.0) || $time < $min || $time > $max) {
                continue;
            }
            $accuracy = $this->finite($accuracy) && (float) $accuracy >= 0 && (float) $accuracy <= 10000
                ? round((float) $accuracy, 1) : null;
            $points[] = [round($lat, 6), round($lng, 6), $accuracy, $time, $event];
        }
        usort($points, fn (array $a, array $b) => $a[3] <=> $b[3]);

        $started = $this->timestamp($trace['started_at'] ?? null, $min, $max) ?? ($points[0][3] ?? null);
        $ended = $this->timestamp($trace['ended_at'] ?? null, $min, $max) ?? ($points ? end($points)[3] : null);
        if ($started === null && $points === []) {
            return null;
        }
        if ($started !== null && $ended !== null && $ended < $started) {
            [$started, $ended] = [$ended, $started];
        }

        return [
            'started_at' => $started !== null ? CarbonImmutable::createFromTimestampUTC($started)->toIso8601String() : null,
            'ended_at' => $ended !== null ? CarbonImmutable::createFromTimestampUTC($ended)->toIso8601String() : null,
            'points' => $points,
        ];
    }

    private function finite(mixed $value): bool
    {
        return is_numeric($value) && is_finite((float) $value);
    }

    private function timestamp(mixed $value, int $min, int $max): ?int
    {
        if (! is_string($value) || $value === '') {
            return null;
        }
        try {
            $time = CarbonImmutable::parse($value)->getTimestamp();
        } catch (Throwable) {
            return null;
        }

        return $time >= $min && $time <= $max ? $time : null;
    }
}
