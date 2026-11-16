import { User } from '../../../models';

export interface UpdateUserRoleResponse {
  message: string;
  user: User;
}
