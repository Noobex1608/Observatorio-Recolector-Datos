<?php

namespace App\Application\Responses\Services;

use App\Jobs\SyncFormResponseToSupabase;
use App\Models\FormResponse;
use App\Models\ResponseSyncQueue;

class EnqueueResponseSync
{
    public function __construct(private readonly ResponseSyncPayloadFactory $payloadFactory)
    {
    }

    public function enqueue(FormResponse $response): void
    {
        $payload = $this->payloadFactory->fromFormResponse($response);

        $item = ResponseSyncQueue::updateOrCreate(
            ['form_response_id' => $response->id],
            [
                'form_id' => $response->form_id,
                'user_id' => $response->user_id,
                'payload' => $payload,
                'status' => 'pending',
                'next_retry_at' => now(),
                'last_error' => null,
            ]
        );

        SyncFormResponseToSupabase::dispatch($item->id);
    }
}

