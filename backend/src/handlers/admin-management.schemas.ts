import { z } from 'zod';

const UserPlanSchema = z.enum(['free', 'pro', 'administrator']);

export const CreateUserSchema = z.object({
  username: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
  plan: UserPlanSchema.optional(),
  expiresAt: z.string().nullable().optional(),
});

export const UpdateUserSchema = z.object({
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  plan: UserPlanSchema.optional(),
  expiresAt: z.string().nullable().optional(),
});

export const ReactivateUserSchema = z.object({
  expiresAt: z.string().nullable().optional(),
});

export const EmailVaultSchema = z.object({
  vaultId: z.string().optional(),
});
