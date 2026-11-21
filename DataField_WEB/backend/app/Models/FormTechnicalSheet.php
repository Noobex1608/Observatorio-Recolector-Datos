<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Ficha técnica (metodológica) de un formulario. La valida el líder o el delegado del proyecto.
 * Las columnas description/start_date/end_date/target_sample_size son historial de la versión
 * anterior; el periodo y la muestra del levantamiento viven en la ficha del proyecto.
 */
class FormTechnicalSheet extends Model
{
    use HasUuids;

    /** Parámetros de la ficha, en el orden en que se muestran. */
    public const PARAMETERS = [
        'target_universe', 'geographic_coverage', 'sample_size',
        'error_margin_confidence', 'field_technique', 'quality_control',
    ];

    protected $fillable = [
        'form_id', 'description', 'start_date', 'end_date', 'target_sample_size',
        'target_universe', 'geographic_coverage', 'sample_size',
        'error_margin_confidence', 'field_technique', 'quality_control',
        'status', 'created_by', 'validated_by', 'validated_at',
    ];

    protected $casts = [
        'start_date' => 'date:Y-m-d',
        'end_date' => 'date:Y-m-d',
        'validated_at' => 'datetime',
        'target_sample_size' => 'integer',
    ];

    public function form()
    {
        return $this->belongsTo(Form::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function validator()
    {
        return $this->belongsTo(User::class, 'validated_by');
    }

    /** Parámetros que siguen vacíos (impiden validar). */
    public function missingParameters(): array
    {
        return array_values(array_filter(self::PARAMETERS, fn ($field) => trim((string) $this->{$field}) === ''));
    }
}
