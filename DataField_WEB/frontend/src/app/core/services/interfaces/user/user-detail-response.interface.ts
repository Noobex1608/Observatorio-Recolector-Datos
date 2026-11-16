import { User } from '../../../models';

export interface UserDetailResponse {
  message?: string;
  data: User;
}
