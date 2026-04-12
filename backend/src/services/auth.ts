import {
  ERRORS,
  LIMITS,
  type LoginRequest,
  type LoginResponse,
  type ChangePasswordRequest,
  type SelfChangePasswordRequest,
  type ChangePasswordResponse,
  type UpdateProfileRequest,
  type UserRole,
} from '@passvault/shared';
import { config } from '../config.js';
import {
  getUserById,
  getUserByUsername,
  updateUser,
  recordLoginEvent,
  listPasskeyCredentials,
  getUserByEmailChangeToken,
  getUserByEmailChangeLockToken,
} from '../utils/dynamodb.js';
import { randomUUID } from 'crypto';
import { sendHtmlEmail } from '../utils/ses.js';
import { renderEmail, formatAbsoluteTime } from '../utils/email-templates.js';
import { resolveLanguage } from '../utils/language.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { validatePassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { verifyPasskeyToken } from './passkey.js';
import { recordAuditEvent } from '../utils/audit.js';


export async function login(request: LoginRequest, acceptLanguage?: string): Promise<{ response?: LoginResponse; error?: string; statusCode?: number }> {
  let user;
  let passkeyLogin = false;
  let passkeyCredentialId: string | undefined;
  let passkeyName: string | undefined;
  let userPasskeyCreds: unknown[] | undefined;

  if (request.passkeyToken) {
    // Passkey login path: passkeyToken identifies the user
    let tokenResult: { userId: string; credentialId: string; passkeyName: string };
    try {
      tokenResult = await verifyPasskeyToken(request.passkeyToken);
    } catch {
      return { error: ERRORS.INVALID_PASSKEY, statusCode: 401 };
    }
    user = await getUserById(tokenResult.userId);
    if (!user) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
    passkeyLogin = true;
    passkeyCredentialId = tokenResult.credentialId;
    passkeyName = tokenResult.passkeyName;
  } else {
    // Username + password login path
    if (typeof request.username !== 'string' || request.username.length === 0 || request.username.length > LIMITS.EMAIL_MAX_LENGTH) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
    if (typeof request.password !== 'string' || request.password.length === 0 || request.password.length > LIMITS.MAX_PASSWORD_LENGTH) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
    user = await getUserByUsername(request.username);
    if (!user) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
    // If a regular user has passkeys registered, they must use passkey login.
    // Admins are exempt: they log in with password first, then verify passkey in a second step.
    userPasskeyCreds = await listPasskeyCredentials(user.userId);
    if (userPasskeyCreds.length > 0 && user.role !== 'admin') {
      return { error: ERRORS.INVALID_PASSKEY, statusCode: 401 };
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

  // Passkey users: passkeyToken already verified above — skip password check
  if (!passkeyLogin) {
    // First-time login: verify against OTP hash
    if (user.status === 'pending_first_login') {
      if (!user.oneTimePasswordHash) {
        return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
      }
      if (user.otpExpiresAt && new Date(user.otpExpiresAt) < now) {
        return { error: ERRORS.OTP_EXPIRED, statusCode: 401 };
      }
      const otpValid = await verifyPassword(request.password!, user.oneTimePasswordHash);
      if (!otpValid) {
        await recordFailedAttempt(user.userId, user.username, user.failedLoginAttempts ?? 0);
        return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
      }
    } else {
      // Normal login (active, expired): verify against password hash
      const passwordValid = await verifyPassword(request.password!, user.passwordHash);
      if (!passwordValid) {
        await recordFailedAttempt(user.userId, user.username, user.failedLoginAttempts ?? 0);
        return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
      }
    }
  }

  // Admin accounts auto-lock when expiration date has passed
  if (user.role === 'admin' && user.expiresAt && new Date(user.expiresAt) < now) {
    await updateUser(user.userId, { status: 'locked' });
    return { error: ERRORS.ACCOUNT_EXPIRED, statusCode: 403 };
  }

  // Resolve language from Accept-Language header if user has 'auto' or no preference
  const loginUpdates: Partial<import('@passvault/shared').User> = {
    lastLoginAt: new Date().toISOString(),
    failedLoginAttempts: 0,
    lockedUntil: null,
  };
  if (!user.preferredLanguage || user.preferredLanguage === 'auto') {
    const resolved = resolveLanguage('auto', acceptLanguage);
    if (resolved !== 'en' || !user.preferredLanguage) {
      loginUpdates.preferredLanguage = resolved as import('@passvault/shared').PreferredLanguage;
    }
  }
  await updateUser(user.userId, loginUpdates);

  const loginEventId = randomUUID();
  // Deprecated: kept for backward compatibility
  recordLoginEvent(loginEventId, user.userId, true, passkeyCredentialId, passkeyName).catch(err => {
    console.error('Failed to record login event:', err);
  });
  // Audit log
  await recordAuditEvent({
    category: 'authentication',
    action: 'login',
    userId: user.userId,
    details: passkeyName ? { method: 'passkey', passkeyName } : { method: 'password' },
  }).catch(err => console.error('Failed to record audit event:', err));

  const token = await signToken({
    userId: user.userId,
    username: user.username,
    role: user.role,
    status: user.status,
  });

  const response: LoginResponse = {
    token,
    userId: user.userId,
    role: user.role,
    username: user.username,
    plan: user.plan,
    loginEventId,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    displayName: user.displayName ?? null,
    expiresAt: user.expiresAt ?? null,
    preferredLanguage: user.preferredLanguage,
  };

  if (user.status === 'pending_first_login') {
    response.requirePasswordChange = true;
  }
  if (user.status === 'pending_passkey_setup' && config.features.passkeyRequired) {
    response.requirePasskeySetup = true;
  }
  if (user.status === 'expired') {
    response.accountExpired = true;
  }

  // Active admins with passkeys on passkeyRequired envs: signal the frontend
  // to prompt for passkey verification as a second step.
  // Admins still onboarding (pending_first_login, pending_passkey_setup) skip this.
  if (
    user.role === 'admin' &&
    config.features.passkeyRequired &&
    user.status === 'active' &&
    !passkeyLogin
  ) {
    const adminCreds = userPasskeyCreds ?? await listPasskeyCredentials(user.userId);
    if (adminCreds.length > 0) {
      response.requirePasskeyVerification = true;
    }
  }

  return { response };
}

export async function changePassword(
  userId: string,
  username: string,
  request: ChangePasswordRequest,
  role: UserRole = 'user',
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

  // Admin in beta/prod: must set up passkey after first password change
  const nextStatus = (role === 'admin' && config.features.passkeyRequired) ? 'pending_passkey_setup' : 'active';

  const isFirstLogin = user?.status === 'pending_first_login';

  await updateUser(userId, {
    passwordHash: newHash,
    status: nextStatus,
    oneTimePasswordHash: null,
    otpExpiresAt: null,
  });

  await recordAuditEvent({
    category: 'system',
    action: 'password_changed',
    userId,
    performedBy: userId,
    details: { firstLogin: String(isFirstLogin) },
  }).catch(err => console.error('Failed to record audit event:', err));

  // Offer passkey setup after first password change (users go to optional setup; admin in beta/prod goes to mandatory setup)
  const offerPasskeySetup = isFirstLogin ? true : undefined;
  return { response: { success: true, offerPasskeySetup } };
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

  await recordAuditEvent({
    category: 'system',
    action: 'password_changed',
    userId,
    performedBy: userId,
    details: { selfService: 'true' },
  }).catch(err => console.error('Failed to record audit event:', err));

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
  if ('preferredLanguage' in request) updates.preferredLanguage = request.preferredLanguage ?? 'auto';

  if (request.email !== undefined) {
    // On beta/prod, email changes must go through the verified email-change flow
    if (config.environment !== 'dev') {
      return { error: ERRORS.EMAIL_CHANGE_REQUIRES_FLOW, statusCode: 400 };
    }
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

// ── Secure Email Change Flow ────────────────────────────────────────────────

export async function requestEmailChange(
  userId: string,
  newEmail: string,
): Promise<{ error?: string; statusCode?: number }> {
  if (!LIMITS.EMAIL_PATTERN.test(newEmail)) {
    return { error: ERRORS.INVALID_EMAIL, statusCode: 400 };
  }
  if (newEmail.length > LIMITS.EMAIL_MAX_LENGTH) {
    return { error: ERRORS.INVALID_EMAIL, statusCode: 400 };
  }

  const existing = await getUserByUsername(newEmail);
  if (existing && existing.userId !== userId) {
    return { error: ERRORS.USER_EXISTS, statusCode: 409 };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  }

  // On dev: skip emails, update immediately
  if (config.environment === 'dev') {
    await updateUser(userId, { username: newEmail });
    return {};
  }

  // beta/prod: generate tokens and send emails
  const emailChangeToken = randomUUID();
  const emailChangeLockToken = randomUUID();
  const now = new Date();
  const emailChangeTokenExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const emailChangeLockTokenExpiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  await updateUser(userId, {
    pendingEmail: newEmail,
    emailChangeToken,
    emailChangeTokenExpiresAt,
    emailChangeLockToken,
    emailChangeLockTokenExpiresAt,
  });

  const frontendUrl = process.env.FRONTEND_URL || '';
  const lang = resolveLanguage(user.preferredLanguage);

  // Send verification email to the NEW address
  const verifyUrl = `${frontendUrl}/verify-email-change?token=${emailChangeToken}`;
  const verifyLinkExpiresAt = formatAbsoluteTime(new Date(emailChangeTokenExpiresAt), lang);
  const verifyEmail = await renderEmail('email-change-verify', lang, {
    verifyUrl,
    linkExpiryHours: '24',
    linkExpiresAt: verifyLinkExpiresAt,
  });
  await sendHtmlEmail(newEmail, verifyEmail.subject, verifyEmail.html, verifyEmail.plainText);

  // Send notification to the OLD address
  const lockUrl = `${frontendUrl}/lock-account?token=${emailChangeLockToken}`;
  const lockLinkExpiresAt = formatAbsoluteTime(new Date(emailChangeLockTokenExpiresAt), lang);
  const notifyEmail = await renderEmail('email-change-notify', lang, {
    newEmail,
    lockUrl,
    linkExpiryHours: '1',
    linkExpiresAt: lockLinkExpiresAt,
  });
  await sendHtmlEmail(user.username, notifyEmail.subject, notifyEmail.html, notifyEmail.plainText);

  return {};
}

export async function verifyEmailChange(
  token: string,
): Promise<{ error?: string; statusCode?: number }> {
  const user = await getUserByEmailChangeToken(token);
  if (!user) {
    return { error: ERRORS.EMAIL_CHANGE_TOKEN_INVALID, statusCode: 400 };
  }

  if (!user.emailChangeTokenExpiresAt || new Date(user.emailChangeTokenExpiresAt) < new Date()) {
    return { error: ERRORS.EMAIL_CHANGE_TOKEN_INVALID, statusCode: 400 };
  }

  if (!user.pendingEmail) {
    return { error: ERRORS.EMAIL_CHANGE_TOKEN_INVALID, statusCode: 400 };
  }

  // Check uniqueness one more time at verification
  const existing = await getUserByUsername(user.pendingEmail);
  if (existing && existing.userId !== user.userId) {
    return { error: ERRORS.USER_EXISTS, statusCode: 409 };
  }

  const oldEmail = user.username;
  await updateUser(user.userId, {
    username: user.pendingEmail,
    pendingEmail: undefined,
    emailChangeToken: undefined,
    emailChangeTokenExpiresAt: undefined,
    emailChangeLockToken: undefined,
    emailChangeLockTokenExpiresAt: undefined,
  });

  await recordAuditEvent({
    category: 'system',
    action: 'email_changed',
    userId: user.userId,
    performedBy: user.userId,
    details: { oldEmail, newEmail: user.pendingEmail },
  }).catch(err => console.error('Failed to record audit event:', err));

  return {};
}

export async function lockSelf(
  token: string,
): Promise<{ error?: string; statusCode?: number }> {
  const user = await getUserByEmailChangeLockToken(token);
  if (!user) {
    return { error: ERRORS.EMAIL_CHANGE_LOCK_TOKEN_INVALID, statusCode: 400 };
  }

  if (!user.emailChangeLockTokenExpiresAt || new Date(user.emailChangeLockTokenExpiresAt) < new Date()) {
    return { error: ERRORS.EMAIL_CHANGE_LOCK_TOKEN_INVALID, statusCode: 400 };
  }

  await updateUser(user.userId, {
    status: 'locked',
    pendingEmail: undefined,
    emailChangeToken: undefined,
    emailChangeTokenExpiresAt: undefined,
    emailChangeLockToken: undefined,
    emailChangeLockTokenExpiresAt: undefined,
  });

  return {};
}

async function recordFailedAttempt(userId: string, username: string, currentAttempts: number): Promise<void> {
  const newCount = currentAttempts + 1;
  const lockedUntil =
    newCount >= LIMITS.RATE_LIMIT_FAILED_ATTEMPTS
      ? new Date(Date.now() + LIMITS.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
      : null;
  await updateUser(userId, { failedLoginAttempts: newCount, lockedUntil });
  // Deprecated: kept for backward compatibility
  recordLoginEvent(randomUUID(), userId, false).catch(err => {
    console.error('Failed to record failed login event:', err);
  });
  // Audit log
  await recordAuditEvent({
    category: 'authentication',
    action: 'login_failed',
    userId,
    details: { username },
  }).catch(err => console.error('Failed to record audit event:', err));
}
