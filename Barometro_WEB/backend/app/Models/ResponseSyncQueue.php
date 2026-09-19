<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ResponseSyncQueue extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'response_sync_queue';

    protected $fillable = [
        'form_response_id',
        'form_id',
        'user_id',
        'payload',
        'status',
        'attempts',
        'last_error',
        'next_retry_at',
        'synced_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'attempts' => 'integer',
        'next_retry_at' => 'datetime',
        'synced_at' => 'datetime',
    ];
}

