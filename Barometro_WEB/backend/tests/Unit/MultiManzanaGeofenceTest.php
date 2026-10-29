<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Projects\Services\ProjectGeofenceVerifier;
use App\Models\ProjectZone;
use PHPUnit\Framework\TestCase;

/**
 * Zona formada por varias manzanas INEC (Manta, sector 130850012007). La web une los polígonos de
 * las manzanas elegidas en un MultiPolygon; aquí se replica esa unión y se verifica en el servidor.
 */
class MultiManzanaGeofenceTest extends TestCase
{
    /** Puntos interiores de cada manzana [lat, lng]. */
    private const INSIDE = [
        '130850012007001' => [-0.9566393, -80.7400447],
        '130850012007002' => [-0.9560497, -80.7395618],
        '130850012007003' => [-0.9566171, -80.7390686],
    ];

    /** Misma regla que mergedManzanaGeometry() en map-geofence-selector.component.ts. */
    private function zoneFor(array $codes): ProjectZone
    {
        $features = json_decode((string) file_get_contents(__DIR__.'/../Fixtures/manzanas_manta_130850012007.json'), true)['features'];
        $byCode = [];
        foreach ($features as $feature) {
            $byCode[$feature['properties']['cod_manzana']] = $feature['geometry'];
        }
        $polygons = [];
        foreach ($codes as $code) {
            $geometry = $byCode[$code];
            if ($geometry['type'] === 'Polygon') {
                $polygons[] = $geometry['coordinates'];
            } else {
                array_push($polygons, ...$geometry['coordinates']);
            }
        }
        $geometry = count($polygons) === 1
            ? ['type' => 'Polygon', 'coordinates' => $polygons[0]]
            : ['type' => 'MultiPolygon', 'coordinates' => $polygons];

        return new ProjectZone([
            'geofence_type' => 'manzana_polygon', 'geometry_json' => $geometry, 'radius_meters' => 0,
            'hierarchy_json' => ['manzana' => $codes[0], 'manzanas' => $codes],
        ]);
    }

    public function test_point_in_any_selected_manzana_is_inside_and_unselected_ones_are_not(): void
    {
        $verifier = new ProjectGeofenceVerifier;
        $zone = $this->zoneFor(['130850012007003', '130850012007001']);

        $this->assertSame('MultiPolygon', $zone->geometry_json['type']);
        $this->assertTrue($verifier->contains($zone, ...self::INSIDE['130850012007003']));
        $this->assertTrue($verifier->contains($zone, ...self::INSIDE['130850012007001']));
        $this->assertFalse($verifier->contains($zone, ...self::INSIDE['130850012007002']), 'Manzana vecina no elegida');
        $this->assertFalse($verifier->contains($zone, -0.9530, -80.7445), 'Punto lejos de la zona');
    }

    public function test_single_manzana_zone_still_works(): void
    {
        $verifier = new ProjectGeofenceVerifier;
        $zone = $this->zoneFor(['130850012007002']);

        $this->assertTrue($verifier->contains($zone, ...self::INSIDE['130850012007002']));
        $this->assertFalse($verifier->contains($zone, ...self::INSIDE['130850012007003']));
    }
}
