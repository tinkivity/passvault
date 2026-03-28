import {
  ERRORS,
  LIMITS,
  type LoginRequest,
  type LoginResponse,
  type ChangePasswordRequest,
  type ChangePasswordResponse,
  type UserStatus,
} from '@passvault/shared';
import { getUserById, getUserByUsername, updateUser, recordLoginEvent } from '../utils/dynamodb.js';
import { randomInt, randomUUID } from 'crypto';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { validatePassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { verifyPasskeyToken } from './passkey.js';
import { sendEmail } from '../utils/ses.js';
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
    // dev/beta: traditional username + password
    if (typeof request.username !== 'string' || request.username.length > LIMITS.USERNAME_MAX_LENGTH) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
    user = await getUserByUsername(request.username);
    if (!user) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
  }

  // H2: Check account lockout
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
    // Normal login: verify against password hash
    const passwordValid = await verifyPassword(request.password, user.passwordHash);
    if (!passwordValid) {
      await recordFailedAttempt(user.userId, user.username, user.failedLoginAttempts ?? 0);
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
  }

  // Update last login and reset lockout counter
  await updateUser(user.userId, {
    lastLoginAt: new Date().toISOString(),
    failedLoginAttempts: 0,
    lockedUntil: null,
  });

  // Fire-and-forget: record login event for admin dashboard metrics
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
    encryptionSalt: user.encryptionSalt,
    loginEventId,
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
    pendingEmail: null,
    emailVerificationCode: null,
    emailVerificationExpiresAt: null,
  });

  return { response: { success: true } };
}

export async function requestEmailChange(
  userId: string,
  newEmail: string,
  password: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  if (!process.env.SENDER_EMAIL) {
    return { error: 'Email change is not available in this environment', statusCode: 503 };
  }

  if (!newEmail || newEmail.length > LIMITS.EMAIL_MAX_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { error: 'Invalid email address', statusCode: 400 };
  }

  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  if (user.status !== 'active') return { error: ERRORS.FORBIDDEN, statusCode: 403 };

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const expiresAt = new Date(Date.now() + config.session.otpExpiryMinutes * 60_000).toISOString();

  await updateUser(userId, {
    pendingEmail: newEmail,
    emailVerificationCode: code,
    emailVerificationExpiresAt: expiresAt,
  });

  await sendEmail(
    newEmail,
    'Confirm your new PassVault email address',
    [
      `Your verification code: ${code}`,
      `This code expires in ${config.session.otpExpiryMinutes} minutes.`,
      'If you did not request this change, you can ignore this email.',
    ].join('\n'),
  );

  return { response: { success: true } };
}

export async function confirmEmailChange(
  userId: string,
  code: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  if (user.status !== 'active') return { error: ERRORS.FORBIDDEN, statusCode: 403 };

  if (!user.pendingEmail || !user.emailVerificationCode) {
    return { error: ERRORS.EMAIL_VERIFICATION_INVALID, statusCode: 400 };
  }

  if (!user.emailVerificationExpiresAt || new Date(user.emailVerificationExpiresAt) < new Date()) {
    return { error: ERRORS.EMAIL_VERIFICATION_INVALID, statusCode: 400 };
  }

  if (code !== user.emailVerificationCode) {
    return { error: ERRORS.EMAIL_VERIFICATION_INVALID, statusCode: 400 };
  }

  await updateUser(userId, {
    email: user.pendingEmail,
    pendingEmail: null,
    emailVerificationCode: null,
    emailVerificationExpiresAt: null,
  });

  return { response: { success: true } };
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
