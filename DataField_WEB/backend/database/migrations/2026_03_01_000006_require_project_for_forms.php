<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        $missingProjectForms = DB::table('forms')->whereNull('project_id')->exists();

        if ($missingProjectForms) {
            $projectId = (string) Str::uuid();
            DB::table('projects')->insert([
                'id' => $projectId,
                'name' => 'Proyecto sin asignar',
                'description' => 'Proyecto creado automaticamente para formularios existentes sin proyecto.',
                'created_by' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('forms')->whereNull('project_id')->update(['project_id' => $projectId]);
        }

        DB::statement('ALTER TABLE forms DROP CONSTRAINT IF EXISTS forms_project_id_foreign');
        DB::statement('ALTER TABLE forms ALTER COLUMN project_id SET NOT NULL');
        DB::statement('ALTER TABLE forms ADD CONSTRAINT forms_project_id_foreign FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE forms DROP CONSTRAINT IF EXISTS forms_project_id_foreign');
        DB::statement('ALTER TABLE forms ALTER COLUMN project_id DROP NOT NULL');
        DB::statement('ALTER TABLE forms ADD CONSTRAINT forms_project_id_foreign FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL');
    }
};
