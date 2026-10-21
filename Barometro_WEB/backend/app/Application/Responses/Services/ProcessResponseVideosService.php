<?php

namespace App\Application\Responses\Services;

use App\Application\Responses\Contracts\VideoStorageAdapter;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;
use Throwable;

class ProcessResponseVideosService
{
    public function __construct(private readonly VideoStorageAdapter $videoStorage) {}

    /**
     * Procesa las respuestas de un formulario detectando videos en Base64,
     * subiéndolos mediante el adaptador de almacenamiento configurado
     * y reemplazando el Base64 pesado por la URL pública.
     *
     * @param  array  $answers  Diccionario de respuestas [question_id => answer_value]
     * @param  string  $formId  ID del formulario
     * @param  int|null  $responseId  ID de la respuesta si ya existe
     * @return array Diccionario de respuestas optimizado con URLs de video
     */
    public function process(array $answers, string $formId, ?int $responseId = null): array
    {
        foreach ($answers as $questionId => $value) {
            if ($this->isVideoPayload($value)) {
                $answers[$questionId] = $this->handleVideoPayload($value, $questionId, $formId, $responseId);
            } elseif (is_string($value) && str_starts_with($value, 'data:video/')) {
                $answers[$questionId] = $this->handleRawBase64Video($value, $questionId, $formId, $responseId);
            }
        }

        return $answers;
    }

    private function isVideoPayload(mixed $value): bool
    {
        if (! is_array($value)) {
            return false;
        }

        $mediaType = strtoupper((string) ($value['mediaType'] ?? ''));
        $type = strtolower((string) ($value['type'] ?? ''));
        $dataUrl = (string) ($value['dataUrl'] ?? '');

        if ($dataUrl === '') {
            return false;
        }

        return $mediaType === 'VIDEO'
            || $type === 'video'
            || str_starts_with($dataUrl, 'data:video/');
    }

    private function handleVideoPayload(array $payload, string|int $questionId, string $formId, ?int $responseId): array
    {
        $dataUrl = $payload['dataUrl'];
        $fileName = $payload['fileName'] ?? null;
        $extension = $this->determineExtension($dataUrl, $fileName);
        $cleanFileName = $fileName
            ? Str::slug(pathinfo($fileName, PATHINFO_FILENAME)).'.'.$extension
            : "video_{$questionId}.{$extension}";

        $slugQId = Str::slug((string) $questionId);
        $path = "responses/{$formId}/{$slugQId}_".Str::uuid()."_{$cleanFileName}";

        try {
            $uploadedUrl = $this->videoStorage->uploadBase64($path, $dataUrl);

            $payload['url'] = $uploadedUrl;
            $payload['path'] = $path;
            $payload['storage_driver'] = $this->videoStorage->getDriverName();
            unset($payload['dataUrl']);

            return $payload;
        } catch (Throwable $e) {
            Log::error("[VideoStorage] Fallo al subir video para pregunta {$questionId}: ".$e->getMessage(), [
                'form_id' => $formId,
                'response_id' => $responseId,
                'exception' => $e,
            ]);

            throw new ServiceUnavailableHttpException(null, 'No se pudo almacenar el video. Reintente el envío.', $e);
        }
    }

    private function handleRawBase64Video(string $dataUrl, string|int $questionId, string $formId, ?int $responseId): string
    {
        $extension = $this->determineExtension($dataUrl);
        $slugQId = Str::slug((string) $questionId);
        $path = "responses/{$formId}/{$slugQId}_".Str::uuid()."_video.{$extension}";

        try {
            return $this->videoStorage->uploadBase64($path, $dataUrl);
        } catch (Throwable $e) {
            Log::error("[VideoStorage] Fallo al subir video crudo para pregunta {$questionId}: ".$e->getMessage(), [
                'form_id' => $formId,
                'response_id' => $responseId,
                'exception' => $e,
            ]);

            throw new ServiceUnavailableHttpException(null, 'No se pudo almacenar el video. Reintente el envío.', $e);
        }
    }

    private function determineExtension(string $dataUrl, ?string $fileName = null): string
    {
        if ($fileName) {
            $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
            if (in_array($ext, ['mp4', 'webm', 'mov', 'ogg', 'avi', 'mkv'])) {
                return $ext;
            }
        }

        if (preg_match('/^data:video\/([a-zA-Z0-9\-_]+);/i', $dataUrl, $matches)) {
            $format = strtolower($matches[1]);

            return match ($format) {
                'quicktime' => 'mov',
                'x-msvideo' => 'avi',
                'webm' => 'webm',
                'ogg' => 'ogg',
                default => 'mp4',
            };
        }

        return 'mp4';
    }
}
