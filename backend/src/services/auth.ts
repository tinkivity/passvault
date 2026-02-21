import {
  ERRORS,
  type LoginRequest,
  type LoginResponse,
  type ChangePasswordRequest,
  type ChangePasswordResponse,
  type UserStatus,
} from '@passvault/shared';
import { getUserByUsername, updateUser } from '../utils/dynamodb.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { validatePassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { verifyCode } from './totp.js';
import { config } from '../config.js';

export async function login(request: LoginRequest): Promise<{ response?: LoginResponse; error?: string; statusCode?: number }> {
  const user = await getUserByUsername(request.username);
  if (!user || user.role !== 'user') {
    return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
  }

  // First-time login: verify against OTP hash
  if (user.status === 'pending_first_login') {
    if (!user.oneTimePasswordHash) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
    const otpValid = await verifyPassword(request.password, user.oneTimePasswordHash);
    if (!otpValid) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }
  } else {
    // Normal login: verify against password hash
    const passwordValid = await verifyPassword(request.password, user.passwordHash);
    if (!passwordValid) {
      return { error: ERRORS.INVALID_CREDENTIALS, statusCode: 401 };
    }

    // Check TOTP if required and user is active
    if (config.features.totpRequired && user.status === 'active' && user.totpEnabled) {
      if (!request.totpCode) {
        return { error: ERRORS.INVALID_TOTP, statusCode: 401 };
      }
      if (!user.totpSecret || !verifyCode(request.totpCode, user.totpSecret)) {
        return { error: ERRORS.INVALID_TOTP, statusCode: 401 };
      }
    }
  }

  // Update last login
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

export async function changePassword(
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
    oneTimePasswordHash: null,
  });

  return { response: { success: true } };
}
