<?php

declare(strict_types=1);

namespace App\Presentation\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectZoneResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $hierarchy = is_array($this->hierarchy_json) ? $this->hierarchy_json : [];
        if (!empty($hierarchy)) {
            $hierarchy['display_label'] = self::formatHierarchyLabel($hierarchy);
        }

        return [
            'id' => $this->id,
            'project_id' => $this->project_id,
            'technical_sheet_id' => $this->technical_sheet_id,
            'name' => $this->name,
            'description' => $this->description,
            'geofence_type' => $this->geofence_type,
            'target_lat' => $this->target_lat,
            'target_lng' => $this->target_lng,
            'radius_meters' => $this->radius_meters,
            'hierarchy_json' => !empty($hierarchy) ? $hierarchy : $this->hierarchy_json,
            'geometry_json' => $this->geometry_json,
            'target_responses' => $this->target_responses,
            'assigned_count' => $this->assigned_count ?? (isset($this->assignedUsers) ? count($this->assignedUsers) : 0),
            'assigned_users' => $this->whenLoaded('assignedUsers', function () {
                return $this->assignedUsers->map(fn($user) => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->pivot->role ?? 'RECOLECTOR',
                ]);
            }),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    public static function formatHierarchyLabel(?array $hierarchy): ?string
    {
        if (empty($hierarchy)) {
            return null;
        }

        $sector = $hierarchy['sector'] ?? null;
        $manzana = $hierarchy['manzana'] ?? null;
        $parroquia = $hierarchy['parroquia'] ?? null;
        $canton = $hierarchy['canton'] ?? null;
        $localidad = $hierarchy['localidad'] ?? $hierarchy['barrio'] ?? $hierarchy['aream'] ?? null;

        $codSector = (string) ($hierarchy['cod_sector'] ?? $hierarchy['sec'] ?? '');
        $codManzana = (string) ($hierarchy['cod_manzana'] ?? $hierarchy['man'] ?? '');

        $locStr = $localidad ? " - {$localidad}" : "";
        $parrStr = $parroquia ? " ({$parroquia})" : "";

        if ($codManzana && strlen($codManzana) === 15 && ctype_digit($codManzana)) {
            $sec = (int) substr($codManzana, 9, 3);
            $man = (int) substr($codManzana, 12, 3);
            return "Manzana {$man} - Sector {$sec}{$locStr}{$parrStr}";
        }

        if ($codSector && strlen($codSector) === 12 && ctype_digit($codSector)) {
            $sec = (int) substr($codSector, 9, 3);
            return "Sector {$sec}{$locStr}{$parrStr}";
        }

        if ($manzana) return (string) $manzana;
        if ($sector) return (string) $sector;
        if ($parroquia) return (string) $parroquia;

        return null;
    }
}
