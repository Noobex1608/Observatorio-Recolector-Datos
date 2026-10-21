<?php

namespace Tests\Unit;

use App\Application\Responses\Services\SpreadsheetExportSanitizer;
use PHPUnit\Framework\TestCase;

class SpreadsheetExportSanitizerTest extends TestCase
{
    public function test_neutralizes_formula_prefixes_even_after_whitespace(): void
    {
        $sanitizer = new SpreadsheetExportSanitizer;
        $this->assertSame("'=1+1", $sanitizer->csvCell('=1+1'));
        $this->assertSame("'\t@SUM(1)", $sanitizer->csvCell("\t@SUM(1)"));
        $this->assertSame("'-foo", $sanitizer->csvCell('-foo'));
    }

    public function test_preserves_numeric_values_and_plain_text(): void
    {
        $sanitizer = new SpreadsheetExportSanitizer;
        $this->assertSame(-3.5, $sanitizer->csvCell(-3.5));
        $this->assertSame('texto', $sanitizer->csvCell('texto'));
    }
}
