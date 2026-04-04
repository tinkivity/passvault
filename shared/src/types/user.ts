export type UserRole = 'admin' | 'user';

export type VaultBackupFrequency = 'weekly' | 'monthly';

export interface NotificationPrefs {
  vaultBackup: VaultBackupFrequency | 'none';
}

export type UserStatus =
  | 'pending_email_verification'  // prod only: awaiting email link click
  | 'pending_first_login'         // account created; must change password
  | 'pending_passkey_setup'       // password set; must register passkey (prod admins only)
  | 'active'                      // fully onboarded
  | 'locked'                      // admin has locked; cannot login
  | 'expired'                     // can login and read; cannot write
  | 'retired';                    // renamed username; effectively non-existent

export type UserPlan = 'free' | 'pro' | 'administrator';

export interface User {
  userId: string;
  username: string;              // valid email address
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  plan: UserPlan;
  oneTimePasswordHash: string | null;
  encryptionSalt: string;
  createdAt: string;
  lastLoginAt: string | null;
  createdBy: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  otpExpiresAt: string | null;
  registrationToken?: string;           // prod only; for email verification link
  registrationTokenExpiresAt?: string;  // ISO 8601
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  expiresAt?: string | null;            // ISO 8601 date; null = lifetime/perpetual
  notificationPrefs?: NotificationPrefs | null;
  lastBackupSentAt?: string | null;     // ISO 8601; updated after each vault backup send
}
