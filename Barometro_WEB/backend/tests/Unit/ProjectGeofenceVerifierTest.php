<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Projects\Services\ProjectGeofenceVerifier;
use App\Models\ProjectZone;
use PHPUnit\Framework\TestCase;

class ProjectGeofenceVerifierTest extends TestCase
{
    public function test_radius_and_polygon_boundaries_are_checked_on_server(): void
    {
        $verifier = new ProjectGeofenceVerifier;
        $radius = new ProjectZone(['geofence_type' => 'radius', 'target_lat' => -0.95,
            'target_lng' => -80.73, 'radius_meters' => 500]);
        $this->assertTrue($verifier->contains($radius, -0.95, -80.73));
        $this->assertFalse($verifier->contains($radius, -0.90, -80.73));

        $polygon = new ProjectZone(['geofence_type' => 'custom_polygon', 'geometry_json' => [
            'type' => 'Polygon', 'coordinates' => [[[-81, -1], [-80, -1], [-80, 0], [-81, 0], [-81, -1]]],
        ]]);
        $this->assertTrue($verifier->contains($polygon, -0.5, -80.5));
        $this->assertFalse($verifier->contains($polygon, 1, -80.5));
    }
}
