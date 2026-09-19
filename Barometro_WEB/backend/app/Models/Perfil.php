<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Perfil extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'perfiles';

    protected $fillable = [
        'user_id',
        'telefono',
        'cargo',
        'avatar',
        'bio',
    ];

    /**
     * Usuario al que pertenece el perfil
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
