<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Application\Responses\Contracts\ResponseMediaStorage;
use App\Application\Responses\Services\ProcessResponseMedia;
use App\Infrastructure\Storage\SharePointResponseMediaStorage;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\Fakes\InMemoryResponseMediaStorage;
use Tests\TestCase;

/** Archivos de las respuestas (fotos, audio, video, firmas) en la biblioteca de SharePoint vía Graph. */
class SharePointMediaStorageTest extends TestCase
{
    private const SITE = 'uleam.sharepoint.com,sitio,web';

    private const LIBRARY = 'biblioteca-123';

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.microsoft.client_id' => 'app', 'services.microsoft.client_secret' => 'secreto', 'services.microsoft.tenant_id' => 'tenant',
            'services.sharepoint.site_id' => self::SITE, 'services.sharepoint.library_id' => self::LIBRARY,
        ]);
        Http::fake([
            'login.microsoftonline.com/*' => Http::response(['access_token' => 'token-app']),
            'graph.microsoft.com/v1.0/sites/*/lists/*/drive*' => Http::response(['id' => 'drive-1']),
            'graph.microsoft.com/v1.0/drives/drive-1/root:/responses/f1/grande.mp4:/createUploadSession' => Http::response(['uploadUrl' => 'https://upload.sharepoint.test/sesion-1']),
            'upload.sharepoint.test/*' => Http::response(['id' => 'item-2'], 201),
            'graph.microsoft.com/v1.0/drives/drive-1/root:/responses/f1/foto.jpg:/content' => Http::response(null, 302, [
                'Location' => 'https://uleam.sharepoint.com/descarga-temporal',
            ]),
            'graph.microsoft.com/v1.0/drives/drive-1/root:/responses/f1/foto.jpg' => Http::response(null, 204),
            'graph.microsoft.com/v1.0/drives/drive-1/root:/*' => Http::response(['id' => 'item-1'], 201),
        ]);
    }

    public function test_small_files_are_uploaded_in_one_request(): void
    {
        app(SharePointResponseMediaStorage::class)->upload('responses/f1/foto.jpg', 'bytes-de-imagen', 'image/jpeg');

        Http::assertSent(fn (Request $request) => $request->method() === 'PUT'
            && str_starts_with($request->url(), 'https://graph.microsoft.com/v1.0/drives/drive-1/root:/responses/f1/foto.jpg:/content')
            && $request->hasHeader('Authorization', 'Bearer token-app')
            && $request->hasHeader('Content-Type', 'image/jpeg')
            && $request->body() === 'bytes-de-imagen');
        // La biblioteca se identifica por sitio y lista, como indicó DIIT.
        Http::assertSent(fn (Request $request) => str_contains(urldecode($request->url()), '/sites/'.self::SITE.'/lists/'.self::LIBRARY.'/drive'));
    }

    public function test_videos_use_an_upload_session_without_sending_the_token(): void
    {
        $video = str_repeat('v', 5 * 1024 * 1024);
        app(SharePointResponseMediaStorage::class)->upload('responses/f1/grande.mp4', $video, 'video/mp4');

        Http::assertSent(fn (Request $request) => $request->method() === 'POST'
            && str_ends_with($request->url(), 'root:/responses/f1/grande.mp4:/createUploadSession'));
        Http::assertSent(fn (Request $request) => $request->url() === 'https://upload.sharepoint.test/sesion-1'
            && $request->hasHeader('Content-Range', 'bytes 0-5242879/5242880')
            && ! $request->hasHeader('Authorization')
            && strlen($request->body()) === 5242880);
    }

    public function test_media_links_are_temporary_graph_download_urls(): void
    {
        $storage = app(SharePointResponseMediaStorage::class);

        $this->assertSame('https://uleam.sharepoint.com/descarga-temporal', $storage->temporaryUrl('responses/f1/foto.jpg'));
        $storage->delete('responses/f1/foto.jpg');
        Http::assertSent(fn (Request $request) => $request->method() === 'DELETE'
            && $request->url() === 'https://graph.microsoft.com/v1.0/drives/drive-1/root:/responses/f1/foto.jpg');
    }

    public function test_files_saved_with_another_driver_are_still_readable_after_switching(): void
    {
        // El destino actual es otro: una respuesta antigua guardada en SharePoint se sigue leyendo de SharePoint.
        $this->app->singleton(ResponseMediaStorage::class, InMemoryResponseMediaStorage::class);
        $url = app(ProcessResponseMedia::class)->temporaryUrl(['path' => 'responses/f1/foto.jpg', 'storage_driver' => 'sharepoint']);

        $this->assertSame('https://uleam.sharepoint.com/descarga-temporal', $url);
        $this->expectExceptionMessage('Medio no encontrado.');
        app(ProcessResponseMedia::class)->temporaryUrl(['path' => 'x.jpg', 'storage_driver' => 'desconocido']);
    }
}
