import type { UserStatus } from './user.js';

export interface CreateUserRequest {
  username: string;
  email?: string;
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
  vaultSizeBytes: number | null;
  email: string | null;
}

export interface ListUsersResponse {
  users: UserSummary[];
}

export interface AdminStats {
  totalUsers: number;
  totalVaultSizeBytes: number;
  loginsLast7Days: number;
}

export interface LoginEventSummary {
  eventId: string;
  userId: string;
  username: string;
  timestamp: string;
  success: boolean;
  logoutAt?: string;
}

export interface ListLoginEventsResponse {
  events: LoginEventSummary[];
}
