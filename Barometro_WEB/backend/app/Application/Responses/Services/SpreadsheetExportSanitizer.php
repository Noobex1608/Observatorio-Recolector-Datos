<?php

declare(strict_types=1);

namespace App\Application\Responses\Services;

class SpreadsheetExportSanitizer
{
    public function csvCell(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }

        $visible = ltrim($value, " \t\r\n\0\x0B");

        return $visible !== '' && str_contains('=+-@', $visible[0]) ? "'".$value : $value;
    }
}
