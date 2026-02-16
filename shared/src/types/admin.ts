import type { UserStatus } from './user.js';

export interface CreateUserRequest {
  username: string;
}

export interface CreateUserResponse {
  success: boolean;
  username: string;
  oneTimePassword: string;
  userId: string;
}

export interface UserSummary {
  userId: string;
  username: string;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ListUsersResponse {
  users: UserSummary[];
}
