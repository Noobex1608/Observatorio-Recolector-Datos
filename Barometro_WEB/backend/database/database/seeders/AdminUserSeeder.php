<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $adminEmail = env('ADMIN_EMAIL');
        $adminPassword = env('ADMIN_PASSWORD');
        $adminName = env('ADMIN_NAME', 'Super Administrador');

        if (empty($adminEmail) || empty($adminPassword)) {
            if (app()->environment('local')) {
                $adminEmail = 'admin@uleam.edu.ec';
                $adminPassword = 'Admin123456!';
                $adminName = 'Super Administrador';
            } else {
                $this->command->error('Error: configura ADMIN_EMAIL y ADMIN_PASSWORD en backend/.env');
                return;
            }
        }

        $existingAdmin = User::where('email', $adminEmail)->first();

        if ($existingAdmin) {
            if ($existingAdmin->rol !== User::ROLE_SUPER_ADMIN) {
                $existingAdmin->rol = User::ROLE_SUPER_ADMIN;
                $existingAdmin->save();
            }
            $this->command->info("Super admin listo: {$adminEmail}");
            return;
        }

        User::create([
            'name' => $adminName,
            'email' => $adminEmail,
            'password' => Hash::make($adminPassword),
            'rol' => User::ROLE_SUPER_ADMIN,
            'is_active' => true,
            'email_verified_at' => now(),
        ]);

        $this->command->info("Super admin creado: {$adminEmail}");
    }
}
