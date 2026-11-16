<?php

declare(strict_types=1);

namespace App\Domain\Forms\Services\XlsForm;

use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;

/**
 * Detecta el formato del Excel por sus hojas y encabezados: XLSForm (hoja «survey», como Kobo)
 * o la plantilla simple en español (columnas «Pregunta» y «Tipo»).
 */
final class QuestionnaireImporter
{
    /** @return array<string, mixed> */
    public function import(string $path): array
    {
        try {
            $reader = IOFactory::createReaderForFile($path);
            $reader->setReadDataOnly(true);
            $book = $reader->load($path);
        } catch (\Throwable) {
            return $this->fail('El archivo no se pudo leer. Descarga la plantilla y guárdala como .xlsx.');
        }

        try {
            $sheets = $book->getAllSheets();
            foreach ($sheets as $sheet) {
                if (Str::lower(trim($sheet->getTitle())) === 'survey') {
                    return (new XlsFormImporter)->import($path);
                }
            }

            $candidates = [];
            foreach ($sheets as $sheet) {
                $header = $sheet->rangeToArray('A1:'.$sheet->getHighestColumn().'1', null, false, false, false)[0] ?? [];
                $columns = SimpleFormImporter::headerMap($header);
                if (in_array('question', $columns, true) && in_array('type', $columns, true)) {
                    $candidates[SimpleFormat::key($sheet->getTitle())] = $sheet;
                }
            }
            $sheet = $candidates[SimpleFormat::key(SimpleFormat::SHEET)]
                ?? collect($candidates)->first(fn ($candidate, $key) => $key !== SimpleFormat::key(SimpleFormat::EXAMPLE_SHEET));
            if (! $sheet) {
                return $this->fail(isset($candidates[SimpleFormat::key(SimpleFormat::EXAMPLE_SHEET)])
                    ? 'Escribe tus preguntas en la hoja «Mi encuesta»; la hoja «Ejemplo» no se importa.'
                    : 'No se reconoce el formato. Usa la plantilla (columnas «Pregunta» y «Tipo») o un XLSForm con la hoja «survey».');
            }

            return (new SimpleFormImporter)->import($sheet);
        } finally {
            $book->disconnectWorksheets();
        }
    }

    /** @return array<string, mixed> */
    private function fail(string $message): array
    {
        return [
            'title' => null, 'sections' => [], 'questions' => [], 'warnings' => [],
            'errors' => [['row' => 0, 'sheet' => 'archivo', 'message' => $message]],
            'summary' => ['sections' => 0, 'questions' => 0], 'valid' => false,
        ];
    }
}
