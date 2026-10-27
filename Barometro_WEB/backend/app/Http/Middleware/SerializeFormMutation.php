<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\Form;
use App\Models\FormQuestion;

class SerializeFormMutation
{
    public function handle(Request $request, Closure $next)
    {
        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) { return $next($request); }
        $id = $request->route('id');
        if (! $id && $request->route('question_id')) {
            $id = FormQuestion::whereKey($request->route('question_id'))->value('form_id');
        }
        if (! $id) { return $next($request); }
        return DB::transaction(function () use ($id, $request, $next) {
            Form::whereKey($id)->lockForUpdate()->firstOrFail();
            return $next($request);
        });
    }
}
