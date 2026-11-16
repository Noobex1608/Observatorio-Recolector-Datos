<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class FormTechnicalSheet extends Model
{
    use HasUuids;

    protected $fillable = [
        'form_id', 'description', 'start_date', 'end_date', 'target_sample_size',
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
}
