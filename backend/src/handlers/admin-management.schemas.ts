import { z } from 'zod';

const UserPlanSchema = z.enum(['free', 'pro', 'administrator']);
const PreferredLanguageSchema = z.enum(['en', 'de', 'fr', 'ru', 'auto']);
const NotificationPrefsSchema = z.object({
  vaultBackup: z.enum(['weekly', 'monthly', 'quarterly', 'none']),
});

export const CreateUserSchema = z.object({
  username: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
  plan: UserPlanSchema.optional(),
  expiresAt: z.string().nullable().optional(),
  preferredLanguage: PreferredLanguageSchema.optional(),
});

export const UpdateUserSchema = z.object({
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  plan: UserPlanSchema.optional(),
  expiresAt: z.string().nullable().optional(),
  preferredLanguage: PreferredLanguageSchema.optional(),
  notificationPrefs: NotificationPrefsSchema.nullable().optional(),
});

export const ReactivateUserSchema = z.object({
  expiresAt: z.string().nullable().optional(),
});

export const EmailVaultSchema = z.object({
  vaultId: z.string().optional(),
});

export const ImportTemplatesSchema = z.object({
  data: z.string().min(1),
});
