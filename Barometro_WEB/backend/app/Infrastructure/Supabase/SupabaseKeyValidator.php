<?php

namespace App\Infrastructure\Supabase;

use RuntimeException;

class SupabaseKeyValidator
{
    /**
     * Valida que la service_role_key sea valida y segura.
     * 
     * @throws RuntimeException si la clave es invalida
     */
    public static function validate(string $serviceKey): void
    {
        $trimmed = trim($serviceKey);

        if ($trimmed === '') {
            throw new RuntimeException(
                'SUPABASE_SERVICE_ROLE_KEY esta vacia. '
                . 'Configura la clave en backend/.env'
            );
        }

        $lower = mb_strtolower($trimmed);

        // Rechazar claves anon o publishable
        if (str_starts_with($lower, 'sb_anon_') || str_starts_with($lower, 'sb_publishable_')) {
            throw new RuntimeException(
                'SUPABASE_SERVICE_ROLE_KEY es una clave anon/publica. '
                . 'Debes usar la service_role key. '
                . 'Encuentrala en: https://supabase.com/dashboard/project/_/settings/api'
            );
        }

        // Validar formato JWT (eyJ...) o formato sb_secret_
        $isJwt = str_starts_with($lower, 'eyj');
        $isSecret = str_starts_with($lower, 'sb_secret_');

        if (!$isJwt && !$isSecret) {
            throw new RuntimeException(
                'SUPABASE_SERVICE_ROLE_KEY tiene formato invalido. '
                . 'Debe ser un JWT (comienza con "eyJ") o una clave secreta (comienza con "sb_secret_").'
            );
        }

        // Validar JWT basico si es JWT
        if ($isJwt) {
            self::validateJwtStructure($trimmed);
        }
    }

    /**
     * Valida la estructura basica de un JWT.
     */
    private static function validateJwtStructure(string $jwt): void
    {
        $parts = explode('.', $jwt);

        if (count($parts) !== 3) {
            throw new RuntimeException(
                'SUPABASE_SERVICE_ROLE_KEY JWT tiene formato invalido. '
                . 'Debe tener 3 partes separadas por puntos.'
            );
        }

        // Decodificar header
        $header = self::base64UrlDecode($parts[0]);
        if ($header === false) {
            throw new RuntimeException('SUPABASE_SERVICE_ROLE_KEY JWT header invalido.');
        }

        $headerJson = json_decode($header, true);
        if (!is_array($headerJson)) {
            throw new RuntimeException('SUPABASE_SERVICE_ROLE_KEY JWT header no es JSON valido.');
        }

        // Decodificar payload
        $payload = self::base64UrlDecode($parts[1]);
        if ($payload === false) {
            throw new RuntimeException('SUPABASE_SERVICE_ROLE_KEY JWT payload invalido.');
        }

        $payloadJson = json_decode($payload, true);
        if (!is_array($payloadJson)) {
            throw new RuntimeException('SUPABASE_SERVICE_ROLE_KEY JWT payload no es JSON valido.');
        }

        // Verificar que sea service_role
        $role = $payloadJson['role'] ?? '';
        if ($role !== 'service_role') {
            throw new RuntimeException(
                'SUPABASE_SERVICE_ROLE_KEY JWT no es service_role. '
                . 'Role encontrado: "' . $role . '". '
                . 'Debes usar una service_role key, no una anon key.'
            );
        }

        // Verificar expiracion (opcional pero recomendado)
        if (isset($payloadJson['exp'])) {
            $exp = $payloadJson['exp'];
            $now = time();

            if ($exp < $now) {
                throw new RuntimeException(
                    'SUPABASE_SERVICE_ROLE_KEY JWT esta expirado. '
                    . 'Expira el: ' . date('Y-m-d H:i:s', $exp) . '. '
                    . 'Rota la clave en: https://supabase.com/dashboard/project/_/settings/api'
                );
            }
        }
    }

    /**
     * Decodifica base64url.
     */
    private static function base64UrlDecode(string $data): string|false
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }

        return base64_decode(strtr($data, '-_', '+/'));
    }
}
