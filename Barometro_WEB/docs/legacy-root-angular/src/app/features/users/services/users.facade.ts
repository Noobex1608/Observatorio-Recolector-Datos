import { inject, Injectable } from '@angular/core';
import { USER_REPOSITORY } from '../../../core/tokens/repository.tokens';
import { UserRepository } from '../../../data-access/repositories/user.repository';
import { User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class UsersFacade {
  private readonly userRepository = inject(USER_REPOSITORY) as UserRepository;

  list() {
    return this.userRepository.list();
  }

  findById(id: number | string) {
    return this.userRepository.findById(id);
  }

  create(user: Omit<User, 'id' | 'createdAt'>) {
    return this.userRepository.create(user);
  }

  update(id: number | string, changes: Partial<User>) {
    return this.userRepository.update(id, changes);
  }

  delete(id: number | string) {
    return this.userRepository.delete(id);
  }
}
