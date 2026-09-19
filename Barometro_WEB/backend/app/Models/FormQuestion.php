<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FormQuestion extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'form_id',
        'type',
        'label',
        'options',
        'branch_rules',
        'required',
        'order',
        'section_name',
        'parent_question_id'
    ];

    protected $casts = [
        'options' => 'array',
        'branch_rules' => 'array',
        'required' => 'boolean'
    ];

    public function form()
    {
        return $this->belongsTo(Form::class);
    }
}
