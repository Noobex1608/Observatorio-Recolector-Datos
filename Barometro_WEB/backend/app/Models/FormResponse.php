<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FormResponse extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'client_submission_id', 'submission_hash', 'instrument_snapshot', 'consent_evidence',
        'form_id',
        'user_id',
        'data',
    ];

    protected $casts = [
        'data' => 'array',
        'instrument_snapshot' => 'array',
        'consent_evidence' => 'array',
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
