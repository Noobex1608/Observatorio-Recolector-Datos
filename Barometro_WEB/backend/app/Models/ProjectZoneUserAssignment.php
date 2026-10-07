<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectZoneUserAssignment extends Model
{
    use HasFactory;

    protected $fillable = [
        'zone_id',
        'user_id',
        'role',
    ];

    public function zone()
    {
        return $this->belongsTo(ProjectZone::class, 'zone_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
