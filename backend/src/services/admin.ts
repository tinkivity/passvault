import { v4 as uuidv4 } from 'uuid';
import { randomUUID } from 'crypto';
import {
  ERRORS,
  LIMITS,
  type LoginRequest,
  type LoginResponse,
  type CreateUserRequest,
  type CreateUserResponse,
  type UpdateUserRequest,
  type ListUsersResponse,
  type ListLoginEventsResponse,
  type AdminStats,
  type User,
  type UserStatus,
  type UserPlan,
} from '@passvault/shared';
import { getUserById, getUserByUsername, getUserByRegistrationToken, createUser, updateUser, listAllUsers, deleteUser, recordLoginEvent, getLoginCountSince, getLoginEvents, listVaultsByUser, getVaultRecord, deleteVaultRecord, listPasskeyCredentials, deletePasskeyCredential } from '../utils/dynamodb.js';
import { hashPassword, verifyPassword, generateOtp, generateSalt } from '../utils/crypto.js';
import { signToken } from '../utils/jwt.js';
import { deleteLegacyVaultFile, deleteVaultSplitFiles } from '../utils/s3.js';
import { sendEmail } from '../utils/ses.js';
import { verifyPasskeyToken } from './passkey.js';
import { deleteVault, sendVaultEmail } from './vault.js';
import { config } from '../config.js';
import { recordAuditEvent } from '../utils/audit.js';

export async function adminLogin(request: LoginRequest): Promise<{ response?: LoginResponse; error?: string; statusCode?: number }> {
  if (typeof request.password !== 'string' || request.password.length > LIMITS.MAX_PASSWORD_LENGTH) {
    return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
  }

  let user;
  let passkeyCredentialId: string | undefined;
  let passkeyName: string | undefined;

  if (config.features.passkeyRequired) {
    if (!request.passkeyToken) {
      return { error: ERRORS.INVALID_PASSKEY, statusCode: 401 };
    }
    let tokenResult: { userId: string; credentialId: string; passkeyName: string };
    try {
      tokenResult = await verifyPasskeyToken(request.passkeyToken);
    } catch {
      return { error: ERRORS.INVALID_PASSKEY, statusCode: 401 };
    }
    user = await getUserById(tokenResult.userId);
    if (!user || user.role !== 'admin') {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
    passkeyCredentialId = tokenResult.credentialId;
    passkeyName = tokenResult.passkeyName;
  } else {
    if (typeof request.username !== 'string' || request.username.length > LIMITS.EMAIL_MAX_LENGTH) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
    user = await getUserByUsername(request.username);
    if (!user || user.role !== 'admin') {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
  }

  // Admin-locked accounts (by another admin or auto-lock on expiration)
  if (user.status === 'locked') {
    return { error: ERRORS.ACCOUNT_SUSPENDED, statusCode: 403 };
  }

  // Check brute-force lockout
  const now = new Date();
  if (user.lockedUntil && new Date(user.lockedUntil) > now) {
    return { error: ERRORS.ACCOUNT_LOCKED, statusCode: 429 };
  }

  const valid = await verifyPassword(request.password, user.passwordHash);
  if (!valid) {
    await recordFailedAttempt(user.userId, user.username, user.failedLoginAttempts ?? 0);
    return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
  }

  // Admin accounts auto-lock when expiration date has passed
  if (user.expiresAt && new Date(user.expiresAt) < now) {
    await updateUser(user.userId, { status: 'locked' });
    return { error: ERRORS.ACCOUNT_EXPIRED, statusCode: 403 };
  }

  await updateUser(user.userId, {
    lastLoginAt: new Date().toISOString(),
    failedLoginAttempts: 0,
    lockedUntil: null,
  });

  const loginEventId = randomUUID();
  // Deprecated: kept for backward compatibility
  recordLoginEvent(loginEventId, user.userId, true, passkeyCredentialId, passkeyName).catch(err => {
    console.error('Failed to record admin login event:', err);
  });
  // Audit log
  recordAuditEvent({
    category: 'authentication',
    action: 'login',
    userId: user.userId,
    details: passkeyName ? { method: 'passkey', passkeyName, role: 'admin' } : { method: 'password', role: 'admin' },
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
    loginEventId,
  };

  if (user.status === 'pending_first_login') {
    response.requirePasswordChange = true;
  } else if (user.status === 'pending_passkey_setup' && config.features.passkeyRequired) {
    response.requirePasskeySetup = true;
  }

  return { response };
}


export async function createUserInvitation(
  request: CreateUserRequest,
  adminUserId: string,
): Promise<{ response?: CreateUserResponse; error?: string; statusCode?: number }> {
  // Validate username as email
  if (!request.username || !LIMITS.EMAIL_PATTERN.test(request.username) || request.username.length > LIMITS.EMAIL_MAX_LENGTH) {
    return { error: ERRORS.INVALID_EMAIL, statusCode: 400 };
  }

  // Determine role from plan
  const isAdminInvite = request.plan === 'administrator';

  // Check if username already exists (excluding retired users — their usernames are renamed)
  const existing = await getUserByUsername(request.username);
  if (existing) {
    return { error: ERRORS.USER_EXISTS, statusCode: 409 };
  }

  const userId = uuidv4();
  const otp = generateOtp();
  const otpHash = await hashPassword(otp);
  const salt = generateSalt();
  const otpExpiresAt = new Date(Date.now() + config.session.otpExpiryMinutes * 60_000).toISOString();

  // Prod: send verification email and set pending_email_verification status
  let userStatus: UserStatus = 'pending_first_login';
  let registrationToken: string | undefined;
  let registrationTokenExpiresAt: string | undefined;

  if (config.environment === 'prod' && process.env.SENDER_EMAIL) {
    registrationToken = uuidv4();
    registrationTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    userStatus = 'pending_email_verification';
  }

  const user: User = {
    userId,
    username: request.username,
    passwordHash: otpHash,
    role: isAdminInvite ? 'admin' : 'user',
    status: userStatus,
    plan: request.plan ?? 'free',
    oneTimePasswordHash: otpHash,
    encryptionSalt: salt,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    createdBy: adminUserId,
    failedLoginAttempts: 0,
    lockedUntil: null,
    otpExpiresAt,
    firstName: request.firstName ?? null,
    lastName: request.lastName ?? null,
    displayName: request.displayName ?? null,
    expiresAt: request.expiresAt !== undefined ? request.expiresAt : null,
    ...(registrationToken && { registrationToken, registrationTokenExpiresAt }),
  };

  await createUser(user);

  // Audit log
  recordAuditEvent({
    category: 'admin_actions',
    action: 'user_created',
    userId,
    performedBy: adminUserId,
    details: { username: request.username, plan: request.plan ?? 'free' },
  }).catch(err => console.error('Failed to record audit event:', err));

  // Send invitation email if configured
  if (process.env.SENDER_EMAIL) {
    console.log(`Sending invitation email to ${request.username}`);
    try {
      const lines: string[] = [
        `Username: ${request.username}`,
        `One-time password: ${otp}`,
        `This password expires in ${config.session.otpExpiryMinutes} minutes.`,
      ];
      if (registrationToken) {
        // Prod: include verification link
        const baseUrl = process.env.FRONTEND_URL || '';
        lines.push(``, `Please verify your email address before logging in:`);
        lines.push(`${baseUrl}/verify-email?token=${registrationToken}`);
        lines.push(`This link expires in 7 days.`);
      } else {
        lines.push('Please log in and change your password immediately.');
      }
      await sendEmail(request.username, 'Your PassVault account', lines.join('\n'));
      console.log(`Invitation email sent to ${request.username}`);
    } catch (err) {
      console.error(`Failed to send invitation email to ${request.username}:`, err);
    }
  }

  return {
    response: {
      success: true,
      username: request.username,
      oneTimePassword: otp,
      userId,
    },
  };
}

export async function listUsers(): Promise<ListUsersResponse> {
  const users = await listAllUsers();
  // Filter out retired users
  const regularUsers = users.filter((u) => u.status !== 'retired');

  const { getVaultFileSize } = await import('../utils/s3.js');
  const vaultData = await Promise.all(
    regularUsers.map(async (u) => {
      const vaults = await listVaultsByUser(u.userId);
      if (vaults.length === 0) return { sizeBytes: null, count: 0, stubs: [] as { vaultId: string; displayName: string; sizeBytes: number | null }[] };
      const sizes = await Promise.all(vaults.map((v) => getVaultFileSize(v.vaultId)));
      const totalSize = sizes.reduce<number>((sum, s) => sum + (s ?? 0), 0);
      return {
        sizeBytes: totalSize,
        count: vaults.length,
        stubs: vaults.map((v, idx) => ({ vaultId: v.vaultId, displayName: v.displayName, sizeBytes: sizes[idx] ?? null })),
      };
    }),
  );

  return {
    users: regularUsers.map((u, i) => ({
      userId: u.userId,
      username: u.username,
      role: u.role,
      status: u.status,
      plan: u.plan,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      vaultSizeBytes: vaultData[i].sizeBytes,
      vaultCount: vaultData[i].count,
      vaults: vaultData[i].stubs,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      displayName: u.displayName ?? null,
      expiresAt: u.expiresAt ?? null,
    })),
  };
}

export async function refreshOtp(
  userId: string,
): Promise<{ response?: CreateUserResponse; error?: string; statusCode?: number }> {
  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  if (user.status !== 'pending_first_login') return { error: ERRORS.FORBIDDEN, statusCode: 403 };

  const otp = generateOtp();
  const otpHash = await hashPassword(otp);
  const otpExpiresAt = new Date(Date.now() + config.session.otpExpiryMinutes * 60_000).toISOString();

  await updateUser(userId, {
    oneTimePasswordHash: otpHash,
    passwordHash: otpHash,
    otpExpiresAt,
    failedLoginAttempts: 0,
    lockedUntil: null,
  });

  if (process.env.SENDER_EMAIL && user.username.includes('@')) {
    try {
      await sendEmail(
        user.username,
        'Your PassVault account - new one-time password',
        [
          `Username: ${user.username}`,
          `New one-time password: ${otp}`,
          `This password expires in ${config.session.otpExpiryMinutes} minutes.`,
          'Please log in and change your password immediately.',
        ].join('\n'),
      );
    } catch (err) {
      console.error(`Failed to send refreshed OTP email to ${user.username}:`, err);
    }
  }

  return {
    response: {
      success: true,
      username: user.username,
      oneTimePassword: otp,
      userId,
    },
  };
}

export async function resetUser(
  userId: string,
  adminUserId: string,
): Promise<{ response?: CreateUserResponse; error?: string; statusCode?: number }> {
  if (userId === adminUserId) return { error: ERRORS.CANNOT_MODIFY_SELF, statusCode: 403 };
  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  if (user.status === 'retired') return { error: ERRORS.FORBIDDEN, statusCode: 403 };

  const otp = generateOtp();
  const otpHash = await hashPassword(otp);
  const otpExpiresAt = new Date(Date.now() + config.session.otpExpiryMinutes * 60_000).toISOString();

  // Delete all passkey credentials
  const passkeys = await listPasskeyCredentials(userId);
  await Promise.all(passkeys.map(pk => deletePasskeyCredential(pk.credentialId)));

  // Reset user to pending_first_login with new OTP
  await updateUser(userId, {
    status: 'pending_first_login',
    passwordHash: otpHash,
    oneTimePasswordHash: otpHash,
    otpExpiresAt,
    failedLoginAttempts: 0,
    lockedUntil: null,
  });

  recordAuditEvent({
    category: 'admin_actions',
    action: 'user_reset',
    userId,
    performedBy: adminUserId,
    details: { username: user.username },
  }).catch(err => console.error('Failed to record audit event:', err));

  // Send email notification if configured
  if (process.env.SENDER_EMAIL && user.username.includes('@')) {
    try {
      await sendEmail(
        user.username,
        'Your PassVault account has been reset',
        [
          `Your account has been reset by an administrator.`,
          ``,
          `Username: ${user.username}`,
          `One-time password: ${otp}`,
          ``,
          `Please log in and set up your account again.`,
        ].join('\n'),
      );
    } catch (err) {
      console.error('Failed to send reset email:', err);
    }
  }

  return {
    response: {
      success: true,
      username: user.username,
      oneTimePassword: otp,
      userId,
    },
  };
}

export async function deleteNewUser(
  userId: string,
  adminUserId: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  if (user.status !== 'pending_first_login' && user.status !== 'pending_email_verification') {
    return { error: ERRORS.FORBIDDEN, statusCode: 403 };
  }

  // Delete all user's vaults from S3 and DynamoDB
  const vaults = await listVaultsByUser(userId);
  for (const vault of vaults) {
    await deleteVaultSplitFiles(vault.vaultId);
    await deleteVaultRecord(vault.vaultId);
  }
  // Also clean up legacy key if it exists
  await deleteLegacyVaultFile(userId);
  await deleteUser(userId);

  recordAuditEvent({
    category: 'admin_actions',
    action: 'user_deleted',
    userId,
    performedBy: adminUserId,
    details: { username: user.username },
  }).catch(err => console.error('Failed to record audit event:', err));

  return { response: { success: true } };
}

export async function lockUser(
  userId: string,
  adminUserId: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  if (userId === adminUserId) return { error: ERRORS.CANNOT_MODIFY_SELF, statusCode: 403 };
  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  if (user.status === 'locked') return { error: 'User is already locked', statusCode: 400 };
  if (user.status === 'retired') return { error: ERRORS.NOT_FOUND, statusCode: 404 };

  await updateUser(userId, { status: 'locked' });
  recordAuditEvent({
    category: 'admin_actions',
    action: 'user_locked',
    userId,
    performedBy: adminUserId,
    details: { username: user.username },
  }).catch(err => console.error('Failed to record audit event:', err));
  return { response: { success: true } };
}

export async function unlockUser(
  userId: string,
  adminUserId: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  if (userId === adminUserId) return { error: ERRORS.CANNOT_MODIFY_SELF, statusCode: 403 };
  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  if (user.status !== 'locked') return { error: 'User is not locked', statusCode: 400 };

  // Admin accounts that are locked due to expiration cannot be unlocked until
  // their expiration date is extended to the future
  if (user.role === 'admin' && user.expiresAt && new Date(user.expiresAt) < new Date()) {
    return { error: 'Cannot unlock an admin account past its expiration date. Update the expiration date first.', statusCode: 400 };
  }

  await updateUser(userId, { status: 'active' });
  recordAuditEvent({
    category: 'admin_actions',
    action: 'user_unlocked',
    userId,
    performedBy: adminUserId,
    details: { username: user.username },
  }).catch(err => console.error('Failed to record audit event:', err));
  return { response: { success: true } };
}

export async function expireUser(
  userId: string,
  adminUserId: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  if (userId === adminUserId) return { error: ERRORS.CANNOT_MODIFY_SELF, statusCode: 403 };
  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  if (user.role === 'admin') return { error: 'Admin accounts cannot be expired. Set an expiration date instead; the account will auto-lock.', statusCode: 400 };
  if (user.status === 'retired') return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  if (user.status === 'expired') return { error: 'User is already expired', statusCode: 400 };

  await updateUser(userId, { status: 'expired' });
  recordAuditEvent({
    category: 'admin_actions',
    action: 'user_expired',
    userId,
    performedBy: adminUserId,
    details: { username: user.username },
  }).catch(err => console.error('Failed to record audit event:', err));
  return { response: { success: true } };
}

export async function retireUser(
  userId: string,
  adminUserId: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  if (userId === adminUserId) return { error: ERRORS.CANNOT_MODIFY_SELF, statusCode: 403 };
  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  if (user.status === 'retired') return { error: ERRORS.NOT_FOUND, statusCode: 404 };

  // Rename username to free the email for reuse
  const retiredUsername = `_retired_${userId}_${user.username}`;
  await updateUser(userId, { status: 'retired', username: retiredUsername });
  recordAuditEvent({
    category: 'admin_actions',
    action: 'user_retired',
    userId,
    performedBy: adminUserId,
    details: { username: user.username },
  }).catch(err => console.error('Failed to record audit event:', err));
  return { response: { success: true } };
}

export async function verifyEmailToken(
  token: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  const user = await getUserByRegistrationToken(token);

  if (
    !user ||
    user.status !== 'pending_email_verification' ||
    !user.registrationTokenExpiresAt ||
    new Date(user.registrationTokenExpiresAt) <= new Date()
  ) {
    return { error: ERRORS.EMAIL_VERIFICATION_INVALID, statusCode: 400 };
  }

  await updateUser(user.userId, {
    status: 'pending_first_login',
    registrationToken: undefined,
    registrationTokenExpiresAt: undefined,
  });

  return { response: { success: true } };
}

export async function listLoginEvents(): Promise<ListLoginEventsResponse> {
  const [rawEvents, users] = await Promise.all([getLoginEvents(500), listAllUsers()]);
  const usernameMap = new Map(users.map(u => [u.userId, u.username]));
  const events = rawEvents
    .filter(ev => ev.timestamp)
    .map(ev => ({
      ...ev,
      username: usernameMap.get(ev.userId) ?? 'unknown',
    }));
  return { events };
}

export async function getStats(): Promise<AdminStats> {
  const users = await listAllUsers();
  const regularUsers = users.filter((u) => u.role === 'user' && u.status !== 'retired');

  const { getVaultFileSize } = await import('../utils/s3.js');
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all vault lists and login count in parallel
  const [vaultLists, loginsLast7Days] = await Promise.all([
    Promise.all(regularUsers.map((u) => listVaultsByUser(u.userId))),
    getLoginCountSince(sevenDaysAgo),
  ]);

  // Fetch all vault sizes in parallel across all users
  const allVaultIds = vaultLists.flat().map((v) => v.vaultId);
  const sizes = await Promise.all(allVaultIds.map((vaultId) => getVaultFileSize(vaultId)));
  const totalVaultSizeBytes = sizes.reduce<number>((sum, s) => sum + (s ?? 0), 0);

  return {
    totalUsers: regularUsers.length,
    totalVaultSizeBytes,
    loginsLast7Days,
  };
}

export async function reactivateUser(
  userId: string,
  expiresAt: string | null,
  adminUserId: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  if (userId === adminUserId) return { error: ERRORS.CANNOT_MODIFY_SELF, statusCode: 403 };
  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  if (user.role === 'admin') return { error: 'Admin accounts cannot be reactivated. Unlock the account instead.', statusCode: 400 };
  if (user.status !== 'expired') return { error: 'User is not expired', statusCode: 400 };

  await updateUser(userId, { status: 'active', expiresAt });
  recordAuditEvent({
    category: 'admin_actions',
    action: 'user_reactivated',
    userId,
    performedBy: adminUserId,
    details: { username: user.username },
  }).catch(err => console.error('Failed to record audit event:', err));
  return { response: { success: true } };
}

export async function updateUserProfile(
  request: UpdateUserRequest,
  adminUserId: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  const user = await getUserById(request.userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };

  // Admins cannot change their own plan or expiration date
  const isSelf = request.userId === adminUserId;
  if (isSelf && 'plan' in request) return { error: 'Cannot change your own plan', statusCode: 403 };
  if (isSelf && 'expiresAt' in request) return { error: 'Cannot change your own expiration date', statusCode: 403 };

  const updates: Partial<Omit<User, 'userId'>> = {};
  if ('firstName' in request) updates.firstName = request.firstName;
  if ('lastName' in request) updates.lastName = request.lastName;
  if ('displayName' in request) updates.displayName = request.displayName;
  if ('plan' in request && request.plan) {
    updates.plan = request.plan as UserPlan;
    // Keep role in sync with plan: administrator ↔ admin, free/pro ↔ user
    if (request.plan === 'administrator' && user.role !== 'admin') {
      updates.role = 'admin';
    } else if (request.plan !== 'administrator' && user.role === 'admin') {
      updates.role = 'user';
    }
  }
  if ('expiresAt' in request) updates.expiresAt = request.expiresAt;

  if (Object.keys(updates).length > 0) {
    await updateUser(request.userId, updates);
    recordAuditEvent({
      category: 'admin_actions',
      action: 'user_updated',
      userId: request.userId,
      performedBy: adminUserId,
      details: { fields: Object.keys(updates).join(',') },
    }).catch(err => console.error('Failed to record audit event:', err));
  }
  return { response: { success: true } };
}

export async function adminEmailUserVault(
  userId: string,
  vaultId?: string,
): Promise<{ response?: { success: true }; error?: string; statusCode?: number }> {
  if (!process.env.SENDER_EMAIL) {
    return { error: 'Email sending is not available in this environment', statusCode: 503 };
  }

  const user = await getUserById(userId);
  if (!user) return { error: ERRORS.NOT_FOUND, statusCode: 404 };
  if (!user.username.includes('@')) return { error: ERRORS.NO_EMAIL_ADDRESS, statusCode: 400 };

  const vaults = await listVaultsByUser(userId);
  if (vaults.length === 0) return { error: ERRORS.VAULT_NOT_FOUND, statusCode: 404 };

  const targets = vaultId ? vaults.filter((v) => v.vaultId === vaultId) : vaults;
  if (targets.length === 0) return { error: ERRORS.VAULT_NOT_FOUND, statusCode: 404 };

  for (const vault of targets) {
    const result = await sendVaultEmail(userId, vault.vaultId);
    if (result.error) return { error: result.error, statusCode: result.statusCode };
  }

  return { response: { success: true } };
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
    console.error('Failed to record failed admin login event:', err);
  });
  // Audit log
  recordAuditEvent({
    category: 'authentication',
    action: 'login_failed',
    userId,
    details: { username, role: 'admin' },
  }).catch(err => console.error('Failed to record audit event:', err));
}
