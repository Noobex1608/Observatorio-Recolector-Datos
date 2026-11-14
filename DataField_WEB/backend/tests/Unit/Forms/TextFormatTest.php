<?php

namespace Tests\Unit\Forms;

use App\Domain\Forms\Services\TextFormat;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class TextFormatTest extends TestCase
{
    public static function cases(): array
    {
        return [
            'correo válido' => ['email', ' Ana.Perez@ULEAM.edu.ec ', 'ana.perez@uleam.edu.ec', true],
            'correo sin dominio' => ['email', 'ana@uleam', 'ana@uleam', false],
            'correo sin arroba' => ['email', 'ana.uleam.edu.ec', 'ana.uleam.edu.ec', false],
            'cédula válida' => ['cedula_ec', '1710034065', '1710034065', true],
            'cédula con guion' => ['cedula_ec', '171003406-5', '1710034065', true],
            'cédula Manabí válida' => ['cedula_ec', '1300000005', '1300000005', true],
            'cédula verificador malo' => ['cedula_ec', '1710034066', '1710034066', false],
            'cédula provincia inexistente' => ['cedula_ec', '2510034065', '2510034065', false],
            'cédula corta' => ['cedula_ec', '171003406', '171003406', false],
            'celular' => ['telefono_ec', '099 123 4567', '0991234567', true],
            'celular internacional' => ['telefono_ec', '+593 99 123 4567', '0991234567', true],
            'fijo Manta' => ['telefono_ec', '(05) 262-3740', '052623740', true],
            'teléfono incompleto' => ['telefono_ec', '09912345', '09912345', false],
            'teléfono que no empieza en 0' => ['telefono_ec', '9912345678', '9912345678', false],
        ];
    }

    #[DataProvider('cases')]
    public function test_normalizes_and_validates(string $format, string $input, string $normalized, bool $valid): void
    {
        $value = TextFormat::normalize($format, $input);

        $this->assertSame($normalized, $value);
        $this->assertSame($valid, TextFormat::error($format, $value) === null);
    }

    public function test_only_known_formats_are_recognised(): void
    {
        $this->assertSame('email', TextFormat::of(['text_format' => 'email']));
        $this->assertNull(TextFormat::of(['text_format' => 'pasaporte']));
        $this->assertNull(TextFormat::of(null));
    }
}
