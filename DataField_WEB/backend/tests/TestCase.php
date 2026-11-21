<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        \Illuminate\Support\Facades\Http::preventStrayRequests();
        config(['queue.default' => 'database']);
    }

    /** Contenido metodológico completo de la ficha del proyecto (necesario para validarla). */
    protected function methodologySheet(): array
    {
        return [
            'general_objective' => 'Conocer la intención de voto de la población.',
            'specific_objectives' => 'Medir la participación por sector urbano y rural.',
            'study_population' => 'Población mayor de 16 años apta para votar.',
            'geographic_coverage' => 'Ecuador, Manabí, cantón Pichincha.',
            'technique_instrument' => 'Encuesta presencial con cuestionario estructurado.',
        ];
    }
}
