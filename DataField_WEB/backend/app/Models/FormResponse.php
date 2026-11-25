<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

class FormResponse extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'client_submission_id', 'submission_hash', 'instrument_snapshot', 'consent_evidence',
        'form_id',
        'user_id',
        'data',
        'location_trace',
        'trace_started_at',
        'void_reason',
        'voided_by',
        'corrections',
    ];

    /** El trazado GPS se entrega solo en la vista de supervisión. */
    protected $hidden = ['location_trace'];

    protected $casts = [
        'data' => 'array',
        'instrument_snapshot' => 'array',
        'consent_evidence' => 'array',
        'location_trace' => 'array',
        'trace_started_at' => 'datetime',
        'corrections' => 'array',
    ];

    public function form()
    {
        return $this->belongsTo(Form::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Mantiene project_zones.responses_received (respuestas vigentes de la zona, para su meta).
     * Anular (borrado suave) resta y restaurar suma. La zona de una respuesta no cambia después:
     * las correcciones no tocan _project_geofence y una zona no cambia de formulario.
     */
    protected static function booted(): void
    {
        static::created(fn (self $response) => $response->countInZone(1));
        static::softDeleted(fn (self $response) => $response->countInZone(-1));
        static::restored(fn (self $response) => $response->countInZone(1));
        static::forceDeleted(function (self $response) {
            if (! $response->trashed()) {
                $response->countInZone(-1);
            }
        });
    }

    public function zoneId(): ?string
    {
        $zoneId = is_array($this->data['_project_geofence'] ?? null) ? ($this->data['_project_geofence']['zone_id'] ?? null) : null;

        return is_string($zoneId) && $zoneId !== '' ? $zoneId : null;
    }

    private function countInZone(int $delta): void
    {
        $zoneId = $this->zoneId();
        if ($zoneId === null || $this->form_id === null) {
            return;
        }
        // Actualización atómica en la base (sin leer y escribir), y sin tocar updated_at de la zona.
        DB::table('project_zones')->where('id', $zoneId)->where('form_id', $this->form_id)->update([
            'responses_received' => DB::raw("CASE WHEN responses_received + ({$delta}) < 0 THEN 0 ELSE responses_received + ({$delta}) END"),
        ]);
    }
}
