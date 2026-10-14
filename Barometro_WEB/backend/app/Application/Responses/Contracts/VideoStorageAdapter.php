<?php

namespace App\Application\Responses\Contracts;

interface VideoStorageAdapter
{
    /**
     * Sube un archivo de video en binario y retorna su URL pública accesible.
     *
     * @param string $path Ruta relativa o clave dentro del almacenamiento
     * @param string $binaryData Contenido binario del archivo
     * @param string $mimeType Tipo MIME (por defecto video/mp4)
     * @return string URL pública o accesible del video
     */
    public function upload(string $path, string $binaryData, string $mimeType = 'video/mp4'): string;

    /**
     * Sube un video codificado en Base64 (Data URL o Base64 plano) y retorna su URL pública.
     *
     * @param string $path Ruta relativa o clave dentro del almacenamiento
     * @param string $base64DataUrl Cadena en formato data:video/...;base64,... o base64 puro
     * @return string URL pública o accesible del video
     */
    public function uploadBase64(string $path, string $base64DataUrl): string;

    /**
     * Elimina un archivo de video del almacenamiento.
     *
     * @param string $path Ruta relativa o clave dentro del almacenamiento
     * @return bool True si se eliminó con éxito
     */
    public function delete(string $path): bool;

    /**
     * Obtiene la URL pública o accesible del video dada su ruta.
     *
     * @param string $path Ruta relativa del video
     * @return string URL pública
     */
    public function getUrl(string $path): string;

    /**
     * Asegura que el bucket o directorio de almacenamiento exista y esté configurado.
     */
    public function ensureBucket(): void;

    /**
     * Retorna el identificador del driver activo (ej. 'supabase', 'local', 's3').
     *
     * @return string
     */
    public function getDriverName(): string;
}
