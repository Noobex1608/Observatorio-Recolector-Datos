<?php

namespace Tests\Feature;

use App\Application\Responses\Contracts\VideoStorageAdapter;
use App\Application\Responses\Services\ProcessResponseVideosService;
use App\Infrastructure\Storage\LocalVideoStorageAdapter;
use App\Infrastructure\Storage\S3VideoStorageAdapter;
use App\Infrastructure\Storage\SupabaseVideoStorageAdapter;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class VideoStorageAdapterTest extends TestCase
{
    public function test_resolves_supabase_adapter_by_default(): void
    {
        Config::set('services.video_storage.driver', 'supabase');
        $adapter = app(VideoStorageAdapter::class);

        $this->assertInstanceOf(SupabaseVideoStorageAdapter::class, $adapter);
        $this->assertEquals('supabase', $adapter->getDriverName());
    }

    public function test_resolves_local_adapter_when_configured(): void
    {
        Config::set('services.video_storage.driver', 'local');
        $adapter = app(VideoStorageAdapter::class);

        $this->assertInstanceOf(LocalVideoStorageAdapter::class, $adapter);
        $this->assertEquals('local', $adapter->getDriverName());
    }

    public function test_resolves_s3_adapter_when_configured(): void
    {
        Config::set('services.video_storage.driver', 's3');
        $adapter = app(VideoStorageAdapter::class);

        $this->assertInstanceOf(S3VideoStorageAdapter::class, $adapter);
        $this->assertEquals('s3', $adapter->getDriverName());
    }

    public function test_local_adapter_uploads_base64_and_generates_url(): void
    {
        Storage::fake('public');

        $adapter = new LocalVideoStorageAdapter('public', 'videos');
        $sampleBase64 = 'data:video/mp4;base64,'.base64_encode('fake-video-content-123');

        $url = $adapter->uploadBase64('test/sample.mp4', $sampleBase64);

        $this->assertNotEmpty($url);
        Storage::disk('public')->assertExists('videos/test/sample.mp4');
        $this->assertEquals('fake-video-content-123', Storage::disk('public')->get('videos/test/sample.mp4'));
    }

    public function test_process_response_videos_service_transforms_video_payload(): void
    {
        Storage::fake('public');
        $adapter = new LocalVideoStorageAdapter('public', 'videos');
        $service = new ProcessResponseVideosService($adapter);

        $answers = [
            'q_gps' => ['lat' => -1.02, 'lng' => -80.45],
            'q_text' => 'Comentario del usuario',
            'q_video' => [
                'type' => 'multimedia',
                'mediaType' => 'VIDEO',
                'dataUrl' => 'data:video/mp4;base64,'.base64_encode('sample-video-bytes'),
                'fileName' => 'entrevista.mp4',
            ],
        ];

        $processed = $service->process($answers, 'form-uuid-100');

        $this->assertEquals(['lat' => -1.02, 'lng' => -80.45], $processed['q_gps']);
        $this->assertEquals('Comentario del usuario', $processed['q_text']);

        // El video procesado debe tener url, path y driver, y no tener el base64 pesado
        $this->assertArrayNotHasKey('dataUrl', $processed['q_video']);
        $this->assertArrayHasKey('url', $processed['q_video']);
        $this->assertArrayHasKey('path', $processed['q_video']);
        $this->assertEquals('local', $processed['q_video']['storage_driver']);
        $this->assertEquals('VIDEO', $processed['q_video']['mediaType']);
    }
}
