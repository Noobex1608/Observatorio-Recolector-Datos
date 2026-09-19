<?php

declare(strict_types=1);

namespace App\Presentation\Http\Resources\Auth;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuthResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        if ($this->resource instanceof \App\Application\Auth\DTOs\AuthResponseDTO) {
            return $this->resource->toArray();
        }

        return is_array($this->resource) ? $this->resource : [];
    }
}
