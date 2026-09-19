<?php

namespace App\Application\Responses\Services;

use App\Models\FormResponse;

class ResponseSyncPayloadFactory
{
    public function fromFormResponse(FormResponse $response): array
    {
        return [
            'id' => $response->id,
            'form_id' => $response->form_id,
            'user_id' => $response->user_id,
            'data' => $response->data ?? [],
            'created_at' => optional($response->created_at)?->toISOString(),
            'updated_at' => optional($response->updated_at)?->toISOString(),
        ];
    }
}

