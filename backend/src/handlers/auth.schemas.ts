import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '@passvault/shared';

export const LoginSchema = z.object({
  password: z.string().min(1).optional(),
  username: z.string().optional(),
  passkeyToken: z.string().optional(),
});

export const ChangePasswordSchema = z.object({
  newPassword: z.string().min(PASSWORD_MIN_LENGTH),
});

export const SelfChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH),
});

// Passkey body: require top-level fields; allow extra properties in nested response object
const PasskeyBodySchema = z.object({
  id: z.string(),
  rawId: z.string(),
  type: z.literal('public-key'),
  clientExtensionResults: z.record(z.unknown()),
}).passthrough();

export const PasskeyVerifySchema = z.object({
  challengeJwt: z.string(),
  assertion: PasskeyBodySchema,
});

export const PasskeyRegisterSchema = z.object({
  challengeJwt: z.string(),
  attestation: PasskeyBodySchema,
  name: z.string().max(64).optional(),
});

export const UpdateProfileSchema = z.object({
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  email: z.string().email().optional(),
});

export const LogoutSchema = z.object({
  eventId: z.string().min(1),
});

export const EmailChangeSchema = z.object({
  newEmail: z.string().email(),
});

export const VerifyEmailChangeSchema = z.object({
  token: z.string().uuid(),
});

export const LockSelfSchema = z.object({
  token: z.string().uuid(),
});
