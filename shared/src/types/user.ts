export type UserRole = 'admin' | 'user';

export type UserStatus = 'pending_first_login' | 'pending_totp_setup' | 'active';

export interface User {
  userId: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  oneTimePasswordHash: string | null;
  totpSecret: string | null;
  totpEnabled: boolean;
  encryptionSalt: string;
  createdAt: string;
  lastLoginAt: string | null;
  createdBy: string | null;
}
