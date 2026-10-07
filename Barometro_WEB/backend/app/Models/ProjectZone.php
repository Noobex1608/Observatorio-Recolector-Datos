<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectZone extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'project_id',
        'technical_sheet_id',
        'name',
        'description',
        'geofence_type',
        'target_lat',
        'target_lng',
        'radius_meters',
        'hierarchy_json',
        'geometry_json',
        'target_responses',
        'assigned_count',
    ];

    protected $casts = [
        'target_lat' => 'float',
        'target_lng' => 'float',
        'radius_meters' => 'integer',
        'target_responses' => 'integer',
        'assigned_count' => 'integer',
        'hierarchy_json' => 'array',
        'geometry_json' => 'array',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function technicalSheet()
    {
        return $this->belongsTo(ProjectTechnicalSheet::class, 'technical_sheet_id');
    }

    public function assignments()
    {
        return $this->hasMany(ProjectZoneUserAssignment::class, 'zone_id');
    }

    public function assignedUsers()
    {
        return $this->belongsToMany(User::class, 'project_zone_user_assignments', 'zone_id', 'user_id')
            ->withPivot('role')
            ->withTimestamps();
    }
}
