<?php

namespace App\Presentation\Http\Controllers\Api;

use App\Domain\Forms\Services\XlsForm\QuestionnaireImporter;
use App\Domain\Forms\Services\XlsForm\SimpleFormExporter;
use App\Domain\Forms\Services\XlsForm\XlsFormExporter;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Importación de cuestionarios desde Excel (plantilla simple en español o XLSForm de Kobo) y plantillas.
 * La vista previa no guarda nada: el constructor carga las preguntas y el usuario guarda como siempre.
 */
class FormInstrumentExcelController extends Controller
{
    public function template(Request $request): StreamedResponse
    {
        abort_if($request->user()->isUser(), 403, 'No tienes permisos para crear formularios.');

        $kobo = $request->query('formato') === 'xlsform';

        return response()->streamDownload(function () use ($kobo) {
            $book = $kobo ? (new XlsFormExporter)->template() : (new SimpleFormExporter)->template();
            (new Xlsx($book))->save('php://output');
            $book->disconnectWorksheets();
        }, $kobo ? 'plantilla-encuesta-xlsform.xlsx' : 'plantilla-encuesta.xlsx', ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
    }

    public function preview(Request $request): JsonResponse
    {
        abort_if($request->user()->isUser(), 403, 'No tienes permisos para crear formularios.');
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:xlsx,xls', 'max:5120'],
        ], [
            'file.mimes' => 'El archivo debe ser un Excel (.xlsx o .xls).',
            'file.max' => 'El archivo no puede superar 5 MB.',
        ]);

        return response()->json((new QuestionnaireImporter)->import($data['file']->getRealPath()));
    }
}
