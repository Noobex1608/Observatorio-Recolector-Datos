<?php

namespace App\Jobs;

use App\Application\Responses\Contracts\SupabaseResponseWriter;
use App\Models\ResponseSyncQueue;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Carbon;
use Throwable;

class SyncFormResponseToSupabase implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public string $queueItemId)
    {
    }

    public function handle(SupabaseResponseWriter $writer): void
    {
        $item = ResponseSyncQueue::find($this->queueItemId);
        if (!$item || $item->status === 'synced') {
            return;
        }

        try {
            $writer->upsertResponse($item->payload ?? []);

            $item->update([
                'status' => 'synced',
                'synced_at' => now(),
                'last_error' => null,
                'next_retry_at' => null,
            ]);
        } catch (Throwable $e) {
            $attempts = ((int) $item->attempts) + 1;
            $maxAttempts = (int) config('services.supabase.max_retry_attempts', 12);
            $baseDelaySeconds = (int) config('services.supabase.retry_base_seconds', 30);
            $nextDelay = min($baseDelaySeconds * (2 ** max(0, $attempts - 1)), 3600);

            $item->update([
                'attempts' => $attempts,
                'status' => $attempts >= $maxAttempts ? 'failed' : 'pending',
                'last_error' => mb_substr($e->getMessage(), 0, 2000),
                'next_retry_at' => Carbon::now()->addSeconds($nextDelay),
            ]);
        }
    }
}

