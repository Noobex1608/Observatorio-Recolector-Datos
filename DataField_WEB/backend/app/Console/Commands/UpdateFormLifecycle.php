<?php

namespace App\Console\Commands;

use App\Domain\Forms\Services\FormLifecycleService;
use Illuminate\Console\Command;

class UpdateFormLifecycle extends Command
{
    protected $signature = 'forms:update-lifecycle';

    protected $description = 'Actualiza automáticamente el estado de formularios según sus fechas de inicio y fin (despliega o archiva)';

    public function handle(FormLifecycleService $lifecycleService): int
    {
        $this->info('Iniciando sincronización de ciclo de vida de formularios...');
        $lifecycleService->syncStates();
        $this->info('Ciclo de vida de formularios actualizado correctamente.');

        return Command::SUCCESS;
    }
}
