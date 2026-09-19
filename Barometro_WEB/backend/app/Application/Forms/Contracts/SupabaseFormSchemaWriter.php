<?php

namespace App\Application\Forms\Contracts;

interface SupabaseFormSchemaWriter
{
    /**
     * @throws \RuntimeException
     */
    public function upsertSurvey(array $record): void;

    /**
     * @throws \RuntimeException
     */
    public function replaceSurveyQuestions(string $surveyId, array $questions): void;

    /**
     * @throws \RuntimeException
     */
    public function deleteSurvey(string $surveyId): void;
}

