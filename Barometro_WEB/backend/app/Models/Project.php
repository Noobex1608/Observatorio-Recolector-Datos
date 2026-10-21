<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Project extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'name',
        'description',
        'created_by',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function leaders()
    {
        return $this->belongsToMany(User::class, 'project_user_leaders')->withTimestamps();
    }

    public function delegates()
    {
        return $this->belongsToMany(User::class, 'project_user_delegates')->withTimestamps();
    }

    public function supervisors()
    {
        return $this->belongsToMany(User::class, 'project_user_supervisors')->withTimestamps();
    }

    public function forms()
    {
        return $this->hasMany(Form::class);
    }

    public function technicalSheet()
    {
        return $this->hasOne(ProjectTechnicalSheet::class);
    }

    public function zones()
    {
        return $this->hasMany(ProjectZone::class);
    }
}
