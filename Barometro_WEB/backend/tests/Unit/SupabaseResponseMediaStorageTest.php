<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Infrastructure\Storage\SupabaseResponseMediaStorage;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class SupabaseResponseMediaStorageTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Config::set('services.supabase.url', 'https://example.supabase.co');
        Config::set('services.supabase.service_role_key', 'sb_secret_test');
        Config::set('services.supabase.response_media_bucket', 'response-media');
    }

    public function test_it_refuses_upload_into_a_public_bucket(): void
    {
        Http::fake([
            'https://example.supabase.co/storage/v1/bucket/response-media' => Http::response(['public' => true]),
        ]);

        $this->expectException(RuntimeException::class);
        (new SupabaseResponseMediaStorage)->upload('responses/a.png', 'image-bytes', 'image/png');
    }

    public function test_private_upload_and_signed_url_do_not_use_public_object_url(): void
    {
        Http::fake([
            'https://example.supabase.co/storage/v1/bucket/response-media' => Http::response(['public' => false]),
            'https://example.supabase.co/storage/v1/object/response-media/responses/a.png' => Http::response(['Key' => 'responses/a.png']),
            'https://example.supabase.co/storage/v1/object/sign/response-media/responses/a.png' => Http::response([
                'signedURL' => '/object/sign/response-media/responses/a.png?token=short-lived',
            ]),
        ]);

        $storage = new SupabaseResponseMediaStorage;
        $storage->upload('responses/a.png', 'image-bytes', 'image/png');
        $url = $storage->temporaryUrl('responses/a.png');

        $this->assertSame('https://example.supabase.co/storage/v1/object/sign/response-media/responses/a.png?token=short-lived', $url);
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_contains($request->url(), '/object/response-media/responses/a.png')
            && $request->hasHeader('x-upsert', 'false'));
    }

    public function test_missing_bucket_can_be_created_private_when_supabase_returns_no_such_bucket(): void
    {
        Http::fake([
            'https://example.supabase.co/storage/v1/bucket/response-media' => Http::response(['code' => 'NoSuchBucket'], 400),
            'https://example.supabase.co/storage/v1/bucket' => Http::response(['name' => 'response-media']),
        ]);

        (new SupabaseResponseMediaStorage)->ensurePrivateBucket();

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && $request->url() === 'https://example.supabase.co/storage/v1/bucket'
            && $request['public'] === false);
    }
}
