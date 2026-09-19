<?php

declare(strict_types=1);

namespace App\Application\Profile\UseCases;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class UploadAvatarUseCase
{
    public function execute(User $user, UploadedFile $file): User
    {
        // Asegurar que el directorio de avatares exista
        if (!Storage::exists('public/avatars')) {
            Storage::makeDirectory('public/avatars');
        }

        // Eliminar avatar anterior si existe
        if ($user->perfil && $user->perfil->avatar) {
            // Extraer nombre del archivo de la URL anterior
            $oldFilename = basename($user->perfil->avatar);
            $oldPath = 'public/avatars/' . $oldFilename;
            if (Storage::exists($oldPath)) {
                Storage::delete($oldPath);
            }
        }

        // Generar nombre único para el archivo
        $filename = 'avatar_' . $user->id . '_' . time() . '.' . $file->getClientOriginalExtension();
        
        // Guardar el archivo
        $file->storeAs('public/avatars', $filename);
        
        // URL completa usando APP_URL + endpoint API (evita problemas de CORS)
        $baseUrl = rtrim(config('app.url'), '/');
        $avatarUrl = $baseUrl . '/api/avatars/' . $filename;

        // Actualizar o crear perfil con el avatar
        if ($user->perfil) {
            $user->perfil->update(['avatar' => $avatarUrl]);
        } else {
            $user->perfil()->create(['avatar' => $avatarUrl]);
        }

        // Recargar relaciones
        $user->load('perfil');

        return $user;
    }
}
