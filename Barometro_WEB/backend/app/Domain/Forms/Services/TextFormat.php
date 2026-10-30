<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services;

/**
 * Formatos para preguntas de texto (`properties.text_format`): correo, cédula y teléfono de Ecuador.
 * La misma lógica existe en la web (core/utils/text-format.ts) y en la app (utils/text-format.ts).
 */
final class TextFormat
{
    public const EMAIL = 'email';

    public const CEDULA_EC = 'cedula_ec';

    public const TELEFONO_EC = 'telefono_ec';

    public const FORMATS = [self::EMAIL, self::CEDULA_EC, self::TELEFONO_EC];

    /** Formato configurado en las propiedades de la pregunta, o null si es texto libre. */
    public static function of(mixed $properties): ?string
    {
        $format = is_array($properties) ? ($properties['text_format'] ?? null) : null;

        return in_array($format, self::FORMATS, true) ? $format : null;
    }

    /** Deja el valor como se guarda: correo en minúsculas; cédula y teléfono solo con dígitos. */
    public static function normalize(string $format, string $value): string
    {
        $value = trim($value);

        return match ($format) {
            self::EMAIL => mb_strtolower($value),
            self::CEDULA_EC => preg_replace('/[\s.\-]/', '', $value) ?? $value,
            self::TELEFONO_EC => self::normalizePhone($value),
            default => $value,
        };
    }

    /** Mensaje de error para un valor ya normalizado, o null si es válido. */
    public static function error(string $format, string $value): ?string
    {
        return match ($format) {
            self::EMAIL => self::validEmail($value) ? null : 'Ingrese un correo electrónico válido (ej. nombre@dominio.com).',
            self::CEDULA_EC => self::cedulaError($value),
            self::TELEFONO_EC => preg_match('/^(09\d{8}|0[2-7]\d{7})$/', $value) === 1
                ? null : 'Ingrese un celular de 10 dígitos (09…) o un teléfono fijo de 9 dígitos (02… a 07…).',
            default => null,
        };
    }

    private static function normalizePhone(string $value): string
    {
        $digits = preg_replace('/\D/', '', $value) ?? '';
        // +593 99 123 4567 -> 0991234567
        if (str_starts_with($digits, '593') && strlen($digits) >= 11) {
            $digits = '0'.substr($digits, 3);
        }

        return $digits;
    }

    private static function validEmail(string $value): bool
    {
        if (mb_strlen($value) > 254 || filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            return false;
        }
        $domain = substr($value, (int) strrpos($value, '@') + 1);

        return str_contains($domain, '.') && ! str_ends_with($domain, '.');
    }

    /** Cédula ecuatoriana: provincia 01-24 o 30, tercer dígito menor a 6 y dígito verificador módulo 10. */
    private static function cedulaError(string $value): ?string
    {
        if (preg_match('/^\d{10}$/', $value) !== 1) {
            return 'La cédula debe tener 10 dígitos.';
        }
        $province = (int) substr($value, 0, 2);
        if (! (($province >= 1 && $province <= 24) || $province === 30) || (int) $value[2] >= 6) {
            return 'La cédula no es válida: revise los primeros dígitos.';
        }
        $sum = 0;
        for ($i = 0; $i < 9; $i++) {
            $product = (int) $value[$i] * ($i % 2 === 0 ? 2 : 1);
            $sum += $product > 9 ? $product - 9 : $product;
        }
        $check = (10 - $sum % 10) % 10;

        return $check === (int) $value[9] ? null : 'La cédula no es válida: revise el último dígito.';
    }
}
