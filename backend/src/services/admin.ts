import { v4 as uuidv4 } from 'uuid';
import {
  ERRORS,
  LIMITS,
  type LoginRequest,
  type LoginResponse,
  type ChangePasswordRequest,
  type ChangePasswordResponse,
  type CreateUserRequest,
  type CreateUserResponse,
  type ListUsersResponse,
  type User,
  type UserStatus,
} from '@passvault/shared';
import { getUserByUsername, createUser, updateUser, listAllUsers } from '../utils/dynamodb.js';
import { hashPassword, verifyPassword, generateOtp, generateSalt } from '../utils/crypto.js';
import { validatePassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { putVaultFile, getVaultFileSize } from '../utils/s3.js';
import { verifyCode } from './totp.js';
import { config } from '../config.js';

export async function adminLogin(request: LoginRequest): Promise<{ response?: LoginResponse; error?: string; statusCode?: number }> {
  const user = await getUserByUsername(request.username);
  if (!user || user.role !== 'admin') {
    return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
  }

  // First-time login: verify against password hash (set during init)
  if (user.status === 'pending_first_login') {
    const valid = await verifyPassword(request.password, user.passwordHash);
    if (!valid) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
  } else {
    const passwordValid = await verifyPassword(request.password, user.passwordHash);
    if (!passwordValid) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }

    if (config.features.totpRequired && user.status === 'active' && user.totpEnabled) {
      if (!request.totpCode) {
        return { error: ERRORS.INVALID_TOTP, statusCode: 401 };
      }
      if (!user.totpSecret || !verifyCode(request.totpCode, user.totpSecret)) {
        return { error: ERRORS.INVALID_TOTP, statusCode: 401 };
      }
    }
  }

  await updateUser(user.userId, { lastLoginAt: new Date().toISOString() });

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
  };

  if (user.status === 'pending_first_login') {
    response.requirePasswordChange = true;
  } else if (user.status === 'pending_totp_setup' && config.features.totpRequired) {
    response.requireTotpSetup = true;
  }

  return { response };
}

export async function adminChangePassword(
  userId: string,
  username: string,
  request: ChangePasswordRequest,
): Promise<{ response?: ChangePasswordResponse; error?: string; statusCode?: number; details?: string[] }> {
  const validation = validatePassword(request.newPassword, username);
  if (!validation.valid) {
    return { error: 'Password does not meet requirements', statusCode: 400, details: validation.errors };
  }

  const newHash = await hashPassword(request.newPassword);
  const nextStatus: UserStatus = config.features.totpRequired ? 'pending_totp_setup' : 'active';

  await updateUser(userId, {
    passwordHash: newHash,
    status: nextStatus,
  });

  return { response: { success: true } };
}

export async function createUserInvitation(
  request: CreateUserRequest,
  adminUserId: string,
): Promise<{ response?: CreateUserResponse; error?: string; statusCode?: number }> {
  // Validate username
  if (
    request.username.length < LIMITS.USERNAME_MIN_LENGTH ||
    request.username.length > LIMITS.USERNAME_MAX_LENGTH ||
    !LIMITS.USERNAME_PATTERN.test(request.username)
  ) {
    return { error: ERRORS.INVALID_USERNAME, statusCode: 400 };
  }

  // Check if username already exists
  const existing = await getUserByUsername(request.username);
  if (existing) {
    return { error: ERRORS.USER_EXISTS, statusCode: 409 };
  }

  const userId = uuidv4();
  const otp = generateOtp();
  const otpHash = await hashPassword(otp);
  const salt = generateSalt();

  const user: User = {
    userId,
    username: request.username,
    passwordHash: otpHash,
    role: 'user',
    status: 'pending_first_login',
    oneTimePasswordHash: otpHash,
    totpSecret: null,
    totpEnabled: false,
    encryptionSalt: salt,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    createdBy: adminUserId,
  };

  await createUser(user);

  // Create empty vault file for user
  await putVaultFile(userId, '');

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
  const regularUsers = users.filter((u) => u.role === 'user');
  const sizes = await Promise.all(regularUsers.map((u) => getVaultFileSize(u.userId)));
  return {
    users: regularUsers.map((u, i) => ({
      userId: u.userId,
      username: u.username,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      vaultSizeBytes: sizes[i],
    })),
  };
}
