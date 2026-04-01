import {
  ERRORS,
  LIMITS,
  type LoginRequest,
  type LoginResponse,
  type ChangePasswordRequest,
  type SelfChangePasswordRequest,
  type ChangePasswordResponse,
  type UpdateProfileRequest,
  type UserStatus,
} from '@passvault/shared';
import { getUserById, getUserByUsername, updateUser, recordLoginEvent } from '../utils/dynamodb.js';
import { randomUUID } from 'crypto';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { validatePassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { verifyPasskeyToken } from './passkey.js';
import { config } from '../config.js';

export async function login(request: LoginRequest): Promise<{ response?: LoginResponse; error?: string; statusCode?: number }> {
  if (typeof request.password !== 'string' || request.password.length > LIMITS.MAX_PASSWORD_LENGTH) {
    return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
  }

  let user;

  if (config.features.passkeyRequired) {
    // prod: passkey token identifies the user; password is the second factor
    if (!request.passkeyToken) {
      return { error: ERRORS.INVALID_PASSKEY, statusCode: 401 };
    }
    let userId: string;
    try {
      userId = await verifyPasskeyToken(request.passkeyToken);
    } catch {
      return { error: ERRORS.INVALID_PASSKEY, statusCode: 401 };
    }
    user = await getUserById(userId);
    if (!user) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
  } else {
    // dev/beta: traditional username (email) + password
    if (typeof request.username !== 'string' || request.username.length > LIMITS.EMAIL_MAX_LENGTH) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
    user = await getUserByUsername(request.username);
    if (!user) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
  }

  // Retired users appear non-existent (username is renamed, so they'd return null above;
  // but handle passkey path explicitly)
  if (user.status === 'retired') {
    return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
  }

  // Email verification required (prod)
  if (user.status === 'pending_email_verification') {
    return { error: 'Email verification required before first login', statusCode: 403 };
  }

  // Admin-suspended users
  if (user.status === 'locked') {
    return { error: ERRORS.ACCOUNT_SUSPENDED, statusCode: 403 };
  }

  // Check brute-force lockout
  const now = new Date();
  if (user.lockedUntil && new Date(user.lockedUntil) > now) {
    return { error: ERRORS.ACCOUNT_LOCKED, statusCode: 429 };
  }

  // First-time login: verify against OTP hash
  if (user.status === 'pending_first_login') {
    if (!user.oneTimePasswordHash) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
    if (user.otpExpiresAt && new Date(user.otpExpiresAt) < now) {
      return { error: ERRORS.OTP_EXPIRED, statusCode: 401 };
    }
    const otpValid = await verifyPassword(request.password, user.oneTimePasswordHash);
    if (!otpValid) {
      await recordFailedAttempt(user.userId, user.username, user.failedLoginAttempts ?? 0);
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
  } else {
    // Normal login (active, pending_passkey_setup, expired): verify against password hash
    const passwordValid = await verifyPassword(request.password, user.passwordHash);
    if (!passwordValid) {
      await recordFailedAttempt(user.userId, user.username, user.failedLoginAttempts ?? 0);
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
  }

  await updateUser(user.userId, {
    lastLoginAt: new Date().toISOString(),
    failedLoginAttempts: 0,
    lockedUntil: null,
  });

  const loginEventId = randomUUID();
  recordLoginEvent(loginEventId, user.userId, user.username, true).catch(err => {
    console.error('Failed to record login event:', err);
  });

  const token = await signToken({
    userId: user.userId,
    username: user.username,
    role: user.role,
    status: user.status,
  });

  const response: LoginResponse = {
    token,
    role: user.role,
    username: user.username,
    plan: user.plan,
    loginEventId,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    displayName: user.displayName ?? null,
  };

  if (user.status === 'pending_first_login') {
    response.requirePasswordChange = true;
  } else if (user.status === 'pending_passkey_setup' && config.features.passkeyRequired) {
    response.requirePasskeySetup = true;
  }

  return { response };
}

export async function changePassword(
  userId: string,
  username: string,
  request: ChangePasswordRequest,
): Promise<{ response?: ChangePasswordResponse; error?: string; statusCode?: number; details?: string[] }> {
  const validation = validatePassword(request.newPassword, username);
  if (!validation.valid) {
    return { error: 'Password does not meet requirements', statusCode: 400, details: validation.errors };
  }

  const user = await getUserById(userId);
  if (user?.status === 'pending_first_login' && user.oneTimePasswordHash) {
    const sameAsOtp = await verifyPassword(request.newPassword, user.oneTimePasswordHash);
    if (sameAsOtp) {
      return { error: ERRORS.PASSWORD_SAME_AS_OTP, statusCode: 400 };
    }
  }

  const newHash = await hashPassword(request.newPassword);
  const nextStatus: UserStatus = config.features.passkeyRequired ? 'pending_passkey_setup' : 'active';

  await updateUser(userId, {
    passwordHash: newHash,
    status: nextStatus,
    oneTimePasswordHash: null,
    otpExpiresAt: null,
  });

  return { response: { success: true } };
}

export async function selfChangePassword(
  userId: string,
  username: string,
  request: SelfChangePasswordRequest,
): Promise<{ response?: ChangePasswordResponse; error?: string; statusCode?: number; details?: string[] }> {
  if (typeof request.currentPassword !== 'string' || request.currentPassword.length > LIMITS.MAX_PASSWORD_LENGTH) {
    return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 400 };
  }

  const user = await getUserById(userId);
  if (!user?.passwordHash) {
    return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 400 };
  }

  const currentValid = await verifyPassword(request.currentPassword, user.passwordHash);
  if (!currentValid) {
    return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 400 };
  }

  const validation = validatePassword(request.newPassword, username);
  if (!validation.valid) {
    return { error: 'Password does not meet requirements', statusCode: 400, details: validation.errors };
  }

  const newHash = await hashPassword(request.newPassword);
  await updateUser(userId, { passwordHash: newHash });

  return { response: { success: true } };
}

export async function updateProfile(
  userId: string,
  request: UpdateProfileRequest,
): Promise<{ error?: string; statusCode?: number }> {
  const updates: Record<string, unknown> = {};

  if ('firstName' in request) updates.firstName = request.firstName ?? null;
  if ('lastName' in request) updates.lastName = request.lastName ?? null;
  if ('displayName' in request) updates.displayName = request.displayName ?? null;

  if (request.email !== undefined) {
    if (!LIMITS.EMAIL_PATTERN.test(request.email)) {
      return { error: ERRORS.INVALID_EMAIL, statusCode: 400 };
    }
    const existing = await getUserByUsername(request.email);
    if (existing && existing.userId !== userId) {
      return { error: ERRORS.USER_EXISTS, statusCode: 409 };
    }
    updates.username = request.email;
  }

  if (Object.keys(updates).length > 0) {
    await updateUser(userId, updates as Parameters<typeof updateUser>[1]);
  }

  return {};
}

async function recordFailedAttempt(userId: string, username: string, currentAttempts: number): Promise<void> {
  const newCount = currentAttempts + 1;
  const lockedUntil =
    newCount >= LIMITS.RATE_LIMIT_FAILED_ATTEMPTS
      ? new Date(Date.now() + LIMITS.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
      : null;
  await updateUser(userId, { failedLoginAttempts: newCount, lockedUntil });
  recordLoginEvent(randomUUID(), userId, username, false).catch(err => {
    console.error('Failed to record failed login event:', err);
  });
}
