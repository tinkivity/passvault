export type UserRole = 'admin' | 'user';

export type UserStatus = 'pending_first_login' | 'pending_passkey_setup' | 'active';

export interface User {
  userId: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  oneTimePasswordHash: string | null;
  passkeyCredentialId: string | null;
  passkeyPublicKey: string | null;
  passkeyCounter: number;
  passkeyTransports: string[] | null;
  passkeyAaguid: string | null;
  encryptionSalt: string;
  createdAt: string;
  lastLoginAt: string | null;
  createdBy: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  email: string | null;
  otpExpiresAt: string | null;
  pendingEmail: string | null;
  emailVerificationCode: string | null;
  emailVerificationExpiresAt: string | null;
}
