import type { UserRole, UserStatus, UserPlan, PreferredLanguage, NotificationPrefs } from './user.js';

export interface CreateUserRequest {
  username: string;  // must be valid email address
  firstName?: string;
  lastName?: string;
  displayName?: string;
  plan?: UserPlan;
  expiresAt?: string | null;  // ISO 8601 date; null = lifetime/perpetual
  preferredLanguage?: PreferredLanguage;
}

export interface UpdateUserRequest {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  plan?: UserPlan;
  expiresAt?: string | null;
  preferredLanguage?: PreferredLanguage;
  notificationPrefs?: NotificationPrefs | null;
}

export interface CreateUserResponse {
  success: boolean;
  username: string;
  oneTimePassword: string;
  userId: string;
}

export interface UserVaultStub {
  vaultId: string;
  displayName: string;
  sizeBytes: number | null;
}

export interface UserSummary {
  userId: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  plan: UserPlan;
  createdAt: string;
  lastLoginAt: string | null;
  vaultSizeBytes: number | null;
  vaultCount: number;
  vaults: UserVaultStub[];
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  expiresAt?: string | null;
  preferredLanguage?: PreferredLanguage;
  notificationPrefs?: NotificationPrefs | null;
  lastBackupSentAt?: string | null;
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
  passkeyCredentialId?: string;
  passkeyName?: string;
}

export interface ListLoginEventsResponse {
  events: LoginEventSummary[];
}
