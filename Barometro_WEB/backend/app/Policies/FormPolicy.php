<?php
namespace App\Policies;

use App\Models\Form;
use App\Models\User;

class FormPolicy
{
    public function submit(User $user, Form $form): bool
    {
        return $user->isActive() && ($user->canManageProjects()
            || $user->leadsProject($form->project_id)
            || ($user->isUser() && $form->shares()->where('user_id', $user->id)->where('role', 'RECOLECTOR')->exists()));
    }

    public function viewResponses(User $user, Form $form): bool
    {
        return $user->isActive() && ! $user->isUser() && ($user->canManageProjects()
            || $user->leadsProject($form->project_id) || $user->isProjectDelegate($form->project_id)
            || $user->supervisesProject($form->project_id) || (int) $form->user_id === (int) $user->id
            || $form->shares()->where('user_id', $user->id)->where('role', 'PROJECT')->exists());
    }
}
