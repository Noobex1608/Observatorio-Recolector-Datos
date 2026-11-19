<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Application\Profile\Services\AvatarStorage;
use App\Models\Perfil;
use Illuminate\Console\Command;
use Throwable;

/**
 * Convierte las fotos de perfil subidas antes de la optimización (JPG/PNG de cualquier tamaño) al
 * formato actual: WebP de 256×256 sin metadatos. Es seguro repetirlo: las que ya son WebP se saltan.
 */
class OptimizeAvatars extends Command
{
    protected $signature = 'avatars:optimize {--dry-run : Solo lista lo que convertiría, sin cambiar nada}';

    protected $description = 'Convierte las fotos de perfil existentes a WebP de 256×256 sin metadatos';

    public function handle(AvatarStorage $avatars): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $converted = $skipped = $missing = $failed = 0;
        $savedBytes = 0;

        Perfil::query()->whereNotNull('avatar')->where('avatar', '!=', '')->orderBy('id')
            ->each(function (Perfil $perfil) use ($avatars, $dryRun, &$converted, &$skipped, &$missing, &$failed, &$savedBytes) {
                $url = (string) $perfil->avatar;
                if (str_ends_with(strtolower((string) parse_url($url, PHP_URL_PATH)), '.webp')) {
                    $skipped++;

                    return;
                }
                $original = $avatars->read($url);
                if ($original === null) {
                    $missing++;
                    $this->warn("Usuario {$perfil->user_id}: no se encontró el archivo de {$url}; se deja como está.");

                    return;
                }

                try {
                    $optimized = $avatars->optimize($original);
                    $savedBytes += strlen($original) - strlen($optimized);
                    if ($dryRun) {
                        $converted++;
                        $this->line("Usuario {$perfil->user_id}: ".$this->kb(strlen($original)).' → '.$this->kb(strlen($optimized)));

                        return;
                    }
                    $newUrl = $avatars->storeOptimized($original);
                    $perfil->update(['avatar' => $newUrl]);
                    if (! $avatars->delete($url)) {
                        $this->warn("Usuario {$perfil->user_id}: la foto nueva quedó guardada pero no se pudo borrar la anterior.");
                    }
                    $converted++;
                    $this->line("Usuario {$perfil->user_id}: ".$this->kb(strlen($original)).' → '.$this->kb(strlen($optimized)));
                } catch (Throwable $e) {
                    $failed++;
                    $this->error("Usuario {$perfil->user_id}: no se pudo convertir ({$e->getMessage()}).");
                }
            });

        $verb = $dryRun ? 'Se convertirían' : 'Convertidas';
        $this->info("{$verb}: {$converted}. Ya optimizadas: {$skipped}. Sin archivo: {$missing}. Con error: {$failed}. Ahorro: ".$this->kb(max(0, $savedBytes)).'.');

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function kb(int $bytes): string
    {
        return number_format($bytes / 1024, 1, ',', '.').' KB';
    }
}
