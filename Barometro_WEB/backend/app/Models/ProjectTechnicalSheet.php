<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectTechnicalSheet extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'project_id',
        'description',
        'start_date',
        'end_date',
        'target_sample_size',
        'status',
        'validated_by',
        'validated_at',
        'created_by',
    ];

    protected $casts = [
        'start_date' => 'date:Y-m-d',
        'end_date' => 'date:Y-m-d',
        'validated_at' => 'datetime',
        'target_sample_size' => 'integer',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function validator()
    {
        return $this->belongsTo(User::class, 'validated_by');
    }

    public function zones()
    {
        return $this->hasMany(ProjectZone::class, 'technical_sheet_id');
    }
}
