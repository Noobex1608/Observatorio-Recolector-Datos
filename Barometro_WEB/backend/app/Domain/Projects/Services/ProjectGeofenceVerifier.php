<?php

declare(strict_types=1);

namespace App\Domain\Projects\Services;

use App\Models\ProjectZone;

class ProjectGeofenceVerifier
{
    public function contains(ProjectZone $zone, float $latitude, float $longitude): bool
    {
        $geometry = $zone->geometry_json;
        if (in_array($zone->geofence_type, ['manzana_polygon', 'custom_polygon'], true)
            && is_array($geometry) && $this->insideGeometry($geometry, $latitude, $longitude)) {
            return true;
        }
        if ($zone->target_lat === null || $zone->target_lng === null) {
            return false;
        }
        $earthRadius = 6371000.0;
        $lat1 = deg2rad($latitude);
        $lat2 = deg2rad((float) $zone->target_lat);
        $deltaLat = deg2rad((float) $zone->target_lat - $latitude);
        $deltaLng = deg2rad((float) $zone->target_lng - $longitude);
        $haversine = sin($deltaLat / 2) ** 2 + cos($lat1) * cos($lat2) * sin($deltaLng / 2) ** 2;

        return 2 * $earthRadius * asin(min(1.0, sqrt($haversine))) <= ($zone->radius_meters ?: 500);
    }

    private function insideGeometry(array $geometry, float $latitude, float $longitude): bool
    {
        $polygons = match ($geometry['type'] ?? null) {
            'Polygon' => [$geometry['coordinates'] ?? []],
            'MultiPolygon' => $geometry['coordinates'] ?? [],
            default => [],
        };
        foreach ($polygons as $polygon) {
            if (! is_array($polygon) || ! isset($polygon[0]) || ! $this->insideRing($polygon[0], $longitude, $latitude)) {
                continue;
            }
            // Los anillos interiores son huecos y no forman parte de la zona.
            foreach (array_slice($polygon, 1) as $hole) {
                if ($this->insideRing($hole, $longitude, $latitude)) {
                    continue 2;
                }
            }

            return true;
        }

        return false;
    }

    private function insideRing(mixed $ring, float $x, float $y): bool
    {
        if (! is_array($ring) || count($ring) < 3) {
            return false;
        }
        $inside = false;
        $count = count($ring);
        for ($i = 0, $j = $count - 1; $i < $count; $j = $i++) {
            if (! isset($ring[$i][0], $ring[$i][1], $ring[$j][0], $ring[$j][1])) {
                return false;
            }
            [$xi, $yi] = $ring[$i];
            [$xj, $yj] = $ring[$j];
            if (($yi > $y) !== ($yj > $y) && $x < ($xj - $xi) * ($y - $yi) / ($yj - $yi) + $xi) {
                $inside = ! $inside;
            }
        }

        return $inside;
    }
}
