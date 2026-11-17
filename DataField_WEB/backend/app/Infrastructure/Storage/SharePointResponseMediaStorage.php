<?php

declare(strict_types=1);

namespace App\Infrastructure\Storage;

use App\Application\Responses\Contracts\ResponseMediaStorage;
use App\Infrastructure\Microsoft\GraphAppToken;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Fotos, audios, videos y firmas de las respuestas en la biblioteca de SharePoint de ULEAM, con
 * Microsoft Graph (servicios.sharepoint.site_id / library_id).
 *
 * - Hasta 4 MB: PUT /drives/{drive}/root:/{ruta}:/content.
 * - Más grande (videos): sesión de carga por partes de 10 MiB (múltiplo de 320 KiB, como exige Graph).
 * - Lectura: enlace de descarga preautenticado de Graph (@microsoft.graph.downloadUrl, válido ~1 h);
 *   el navegador lo abre sin credenciales y el archivo nunca queda público.
 */
class SharePointResponseMediaStorage implements ResponseMediaStorage
{
    private const GRAPH = 'https://graph.microsoft.com/v1.0';

    public const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;

    public const CHUNK_SIZE = 32 * 320 * 1024;

    public function __construct(private readonly GraphAppToken $token) {}

    public function upload(string $path, string $bytes, string $mimeType): void
    {
        $item = $this->itemPath($path);
        if (strlen($bytes) <= self::SIMPLE_UPLOAD_LIMIT) {
            $response = $this->graph()->withBody($bytes, $mimeType)
                ->put($item.':/content?@microsoft.graph.conflictBehavior=fail');
            $this->ensureOk($response, 'subir el archivo');

            return;
        }

        $session = $this->graph()->post($item.':/createUploadSession', [
            'item' => ['@microsoft.graph.conflictBehavior' => 'fail'],
        ]);
        $this->ensureOk($session, 'iniciar la carga del archivo');
        $uploadUrl = (string) $session->json('uploadUrl');
        $total = strlen($bytes);

        // La URL de la sesión ya está autorizada: Graph pide no enviar el token en estas peticiones.
        for ($offset = 0; $offset < $total; $offset += self::CHUNK_SIZE) {
            $chunk = substr($bytes, $offset, self::CHUNK_SIZE);
            $end = $offset + strlen($chunk) - 1;
            $response = Http::timeout(120)->retry(2, 1000, throw: false)
                ->withHeaders(['Content-Range' => "bytes {$offset}-{$end}/{$total}"])
                ->withBody($chunk, 'application/octet-stream')
                ->put($uploadUrl);
            if ($response->failed()) {
                Http::delete($uploadUrl);
                $this->ensureOk($response, 'subir una parte del archivo');
            }
        }
    }

    public function temporaryUrl(string $path, int $expiresInSeconds = 300): string
    {
        // GET .../content responde 302 hacia el enlace de descarga preautenticado: se toma sin seguirlo.
        $response = $this->graph()->withoutRedirecting()->get($this->itemPath($path).':/content');
        if ($response->status() === 404) {
            throw new RuntimeException('El archivo no existe en SharePoint.');
        }
        $location = $response->header('Location');
        if ($response->redirect() && $location !== '') {
            return $location;
        }
        $this->ensureOk($response, 'obtener el enlace del archivo');

        throw new RuntimeException('SharePoint no devolvió un enlace de descarga.');
    }

    public function delete(string $path): void
    {
        $response = $this->graph()->delete($this->itemPath($path));
        if ($response->status() !== 404) {
            $this->ensureOk($response, 'eliminar el archivo');
        }
    }

    public function driverName(): string
    {
        return 'sharepoint';
    }

    /** Unidad (drive) de la biblioteca; se consulta una vez y se guarda en caché. */
    private function driveId(): string
    {
        $site = (string) config('services.sharepoint.site_id');
        $library = (string) config('services.sharepoint.library_id');
        if ($site === '' || $library === '') {
            throw new RuntimeException('Faltan SharePoint__SiteId o SharePoint__LibraryId.');
        }

        return Cache::remember("sharepoint-drive:{$site}:{$library}", now()->addDay(), function () use ($site, $library) {
            $response = $this->graph()->get('/sites/'.$site.'/lists/'.$library.'/drive', ['$select' => 'id']);
            $this->ensureOk($response, 'abrir la biblioteca de SharePoint');

            return (string) $response->json('id');
        });
    }

    /** /drives/{id}/root:/responses/{form}/{archivo}, con cada tramo codificado. */
    private function itemPath(string $path): string
    {
        $segments = array_filter(explode('/', trim($path, '/')), fn ($segment) => $segment !== '' && $segment !== '..' && $segment !== '.');
        if ($segments === []) {
            throw new RuntimeException('Ruta de archivo vacía.');
        }

        return '/drives/'.$this->driveId().'/root:/'.implode('/', array_map('rawurlencode', $segments));
    }

    private function graph(): PendingRequest
    {
        return Http::baseUrl(self::GRAPH)->withToken($this->token->get())->acceptJson()->timeout(60);
    }

    private function ensureOk(Response $response, string $action): void
    {
        if ($response->successful()) {
            return;
        }
        if ($response->status() === 401) {
            $this->token->forget();
        }
        throw new RuntimeException("SharePoint no permitió {$action} (HTTP {$response->status()}): ".$response->json('error.code', ''));
    }
}
