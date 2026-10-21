<?php

declare(strict_types=1);

namespace App\Application\Profile\UseCases;

use App\Application\Profile\Services\AvatarStorage;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class UploadAvatarUseCase
{
    public function __construct(private readonly AvatarStorage $avatarStorage) {}

    public function execute(User $user, UploadedFile $file): User
    {
        $user->loadMissing('perfil');
        $oldAvatarUrl = $user->perfil?->avatar;
        $newAvatarUrl = $this->avatarStorage->store($file);

        try {
            DB::transaction(function () use ($user, $newAvatarUrl): void {
                if ($user->perfil) {
                    $user->perfil->update(['avatar' => $newAvatarUrl]);
                } else {
                    $user->perfil()->create(['avatar' => $newAvatarUrl]);
                }
            });
        } catch (Throwable $exception) {
            $this->avatarStorage->delete($newAvatarUrl);
            throw $exception;
        }

        if ($oldAvatarUrl && ! $this->avatarStorage->delete($oldAvatarUrl)) {
            Log::warning('No se pudo eliminar el avatar anterior.', ['user_id' => $user->id]);
        }

        $user->load('perfil');

        return $user;
    }
}
