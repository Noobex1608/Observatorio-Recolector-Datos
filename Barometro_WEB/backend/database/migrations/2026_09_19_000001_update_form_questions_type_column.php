<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE form_questions DROP CONSTRAINT IF EXISTS form_questions_type_check;');
            DB::statement('ALTER TABLE form_questions ALTER COLUMN type TYPE VARCHAR(255);');
        } else {
            Schema::table('form_questions', function (Blueprint $table) {
                $table->string('type', 255)->change();
            });
        }
    }

    public function down(): void
    {
    }
};
