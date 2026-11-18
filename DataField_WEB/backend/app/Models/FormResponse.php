<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

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
}
