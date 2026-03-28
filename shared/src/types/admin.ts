import type { UserStatus, UserPlan } from './user.js';

export interface CreateUserRequest {
  username: string;  // must be valid email address
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
  plan: UserPlan;
  createdAt: string;
  lastLoginAt: string | null;
  vaultSizeBytes: number | null;
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
