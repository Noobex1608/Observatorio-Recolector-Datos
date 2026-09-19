<?php

namespace App\Infrastructure\Supabase;

use App\Application\Forms\Contracts\SupabaseFormSchemaWriter;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class HttpSupabaseFormSchemaWriter implements SupabaseFormSchemaWriter
{
    public function upsertSurvey(array $record): void
    {
        $table = (string) config('services.supabase.surveys_table', 'surveys');
        $endpoint = $this->endpoint($table, '?on_conflict=id');

        $response = $this->request()
            ->post($endpoint, [$record]);

        $this->throwUnlessSuccessful($response->status(), $response->json('message') ?? $response->json('error'));
    }

    public function replaceSurveyQuestions(string $surveyId, array $questions): void
    {
        $table = (string) config('services.supabase.questions_table', 'questions');
        $deleteEndpoint = $this->endpoint($table, '?survey_id=eq.' . rawurlencode($surveyId));

        $deleteResponse = $this->request()->delete($deleteEndpoint);
        $this->throwUnlessSuccessful($deleteResponse->status(), $deleteResponse->json('message') ?? $deleteResponse->json('error'));

        if (empty($questions)) {
            return;
        }

        $insertEndpoint = $this->endpoint($table, '?on_conflict=id');
        $insertResponse = $this->request()->post($insertEndpoint, $questions);

        $this->throwUnlessSuccessful($insertResponse->status(), $insertResponse->json('message') ?? $insertResponse->json('error'));
    }

    public function deleteSurvey(string $surveyId): void
    {
        $table = (string) config('services.supabase.surveys_table', 'surveys');
        $endpoint = $this->endpoint($table, '?id=eq.' . rawurlencode($surveyId));

        $response = $this->request()->delete($endpoint);
        $this->throwUnlessSuccessful($response->status(), $response->json('message') ?? $response->json('error'));
    }

    private function request()
    {
        $serviceKey = trim((string) config('services.supabase.service_role_key'));
        $schema = (string) config('services.supabase.schema', 'public');

        if ($serviceKey === '' || (string) config('services.supabase.url') === '') {
            throw new RuntimeException('Supabase no esta configurado en backend.');
        }

        $this->assertValidServiceRoleKey($serviceKey);

        return Http::timeout(12)
            ->withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer ' . $serviceKey,
                'Content-Type' => 'application/json',
                'Prefer' => 'resolution=merge-duplicates,return=minimal',
                'Accept-Profile' => $schema,
                'Content-Profile' => $schema,
            ]);
    }

    private function endpoint(string $table, string $query = ''): string
    {
        $url = rtrim((string) config('services.supabase.url'), '/');

        return sprintf('%s/rest/v1/%s%s', $url, $table, $query);
    }

    private function throwUnlessSuccessful(int $status, ?string $message): void
    {
        if ($status >= 200 && $status < 300) {
            return;
        }

        throw new RuntimeException((string) ($message ?: 'Supabase respondio con estado ' . $status));
    }

    private function assertValidServiceRoleKey(string $serviceKey): void
    {
        SupabaseKeyValidator::validate($serviceKey);
    }
}