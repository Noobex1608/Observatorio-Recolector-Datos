<?php

declare(strict_types=1);

namespace App\Application\Responses\Services;

use App\Application\Responses\Contracts\ResponseMediaStorage;
use App\Models\Form;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;
use Throwable;

class ProcessResponseMedia
{
    /** @var list<string> */
    private array $uploadedPaths = [];

    public function __construct(private readonly ResponseMediaStorage $storage) {}

    public function process(array $answers, Form $form): array
    {
        $this->uploadedPaths = [];
        $questionTypes = $form->questions()->whereIn('type', ['MULTIMEDIA', 'SIGNATURE'])
            ->pluck('type', 'id')->all();
        $maxFiles = (int) config('services.response_media.max_files', 10);
        $maxFileBytes = (int) config('services.response_media.max_file_bytes', 30 * 1024 * 1024);
        $maxTotalBytes = (int) config('services.response_media.max_total_bytes', 35 * 1024 * 1024);
        $totalBytes = 0;
        $files = 0;

        try {
            foreach ($questionTypes as $questionId => $questionType) {
                $value = $answers[$questionId] ?? null;
                $dataUrl = is_array($value) ? ($value['dataUrl'] ?? null) : $value;
                if (! is_string($dataUrl) || ! str_starts_with($dataUrl, 'data:')) {
                    continue;
                }
                $files++;
                if ($files > $maxFiles) {
                    throw new HttpException(413, 'La respuesta supera el número máximo de medios.');
                }
                [$mime, $bytes] = $this->decode($dataUrl, $maxFileBytes);
                $totalBytes += strlen($bytes);
                if ($totalBytes > $maxTotalBytes) {
                    throw new HttpException(413, 'La respuesta supera el presupuesto total de medios.');
                }
                if ($questionType === 'SIGNATURE' && ! str_starts_with($mime, 'image/')) {
                    throw new HttpException(422, 'La firma debe ser una imagen.');
                }
                $extension = $this->extensionFor($mime);
                $path = 'responses/'.$form->id.'/'.Str::uuid().'.'.$extension;
                try {
                    $this->storage->upload($path, $bytes, $mime);
                } catch (Throwable $e) {
                    throw new ServiceUnavailableHttpException(null, 'No se pudo almacenar el medio. Reintente el envío.', $e);
                }
                $this->uploadedPaths[] = $path;

                $payload = is_array($value) ? $value : ['mediaType' => 'IMAGE'];
                unset($payload['dataUrl'], $payload['blobId'], $payload['previewUrl']);
                $payload['path'] = $path;
                $payload['storage_driver'] = $this->storage->driverName();
                $payload['mimeType'] = $mime;
                $answers[$questionId] = $payload;
            }

            return $answers;
        } catch (Throwable $e) {
            $this->deleteProcessed();
            throw $e;
        }
    }

    public function resetProcessed(): void
    {
        $this->uploadedPaths = [];
    }

    public function deleteProcessed(): void
    {
        foreach ($this->uploadedPaths as $path) {
            try {
                $this->storage->delete($path);
            } catch (Throwable $e) {
                Log::warning('No se pudo limpiar un medio tras un envío fallido.', ['path' => $path, 'exception' => $e]);
            }
        }
        $this->uploadedPaths = [];
    }

    public function temporaryUrl(array $answer): string
    {
        if (($answer['storage_driver'] ?? null) !== $this->storage->driverName()
            || ! is_string($answer['path'] ?? null)) {
            throw new HttpException(404, 'Medio no encontrado.');
        }

        return $this->storage->temporaryUrl($answer['path'], 300);
    }

    /** @return array{string, string} */
    private function decode(string $dataUrl, int $maxBytes): array
    {
        $comma = strpos($dataUrl, ',');
        if ($comma === false || ! preg_match('/^data:((?:image|audio|video)\/[a-z0-9.+-]+);base64$/i', substr($dataUrl, 0, $comma), $matches)) {
            throw new HttpException(422, 'Formato de medio inválido.');
        }
        $encoded = substr($dataUrl, $comma + 1);
        if (strlen($encoded) > (int) ceil($maxBytes * 4 / 3) + 4) {
            throw new HttpException(413, 'El medio supera el tamaño máximo permitido.');
        }
        $bytes = base64_decode($encoded, true);
        if ($bytes === false || strlen($bytes) > $maxBytes) {
            throw new HttpException(422, 'Contenido Base64 inválido o demasiado grande.');
        }
        $declared = strtolower($matches[1]);
        $detected = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if (! is_string($detected) || ($detected !== $declared
            && ! ($declared === 'audio/ogg' && $detected === 'application/ogg')
            && ! ($declared === 'audio/wav' && $detected === 'audio/x-wav'))) {
            throw new HttpException(422, 'El tipo declarado no coincide con el contenido del medio.');
        }
        if (str_starts_with($declared, 'image/') && @getimagesizefromstring($bytes) === false) {
            throw new HttpException(422, 'La imagen no es válida.');
        }

        return [$declared, $bytes];
    }

    private function extensionFor(string $mime): string
    {
        return match ($mime) {
            'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
            'image/gif' => 'gif', 'audio/mpeg' => 'mp3', 'audio/ogg' => 'ogg',
            'audio/wav', 'audio/x-wav' => 'wav', 'audio/webm' => 'webm',
            'video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mov',
            'video/ogg' => 'ogv', default => throw new HttpException(422, 'Tipo de medio no admitido.'),
        };
    }
}
