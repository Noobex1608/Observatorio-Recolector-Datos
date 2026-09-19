<?php

declare(strict_types=1);

namespace App\Domain\Shared\Exceptions;

use Exception;

class ApiException extends Exception
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        int $httpStatus = 400,
        public readonly ?array $details = null,
    ) {
        parent::__construct($message, $httpStatus);
    }

    // Error code constants
    public const DATASET_NOT_FOUND = 'DATASET_NOT_FOUND';
    public const VARIABLE_NOT_FOUND = 'VARIABLE_NOT_FOUND';
    public const DEPARTMENT_NOT_FOUND = 'DEPARTMENT_NOT_FOUND';
    public const CATEGORY_NOT_FOUND = 'CATEGORY_NOT_FOUND';
    public const ACCESS_DENIED = 'ACCESS_DENIED';
    public const VALIDATION_ERROR = 'VALIDATION_ERROR';
    public const INVALID_CHART_TYPE = 'INVALID_CHART_TYPE';
    public const INCOMPATIBLE_VARIABLES = 'INCOMPATIBLE_VARIABLES';
    public const PROCESSING_ERROR = 'PROCESSING_ERROR';
    public const FILE_ERROR = 'FILE_ERROR';
    public const INSUFFICIENT_DATA = 'INSUFFICIENT_DATA';

    public function toArray(): array
    {
        $response = [
            'error' => true,
            'code' => $this->errorCode,
            'message' => $this->getMessage(),
        ];

        if ($this->details) {
            $response['details'] = $this->details;
        }

        return $response;
    }
}
