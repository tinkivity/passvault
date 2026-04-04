import { z } from 'zod';

export const CreateVaultSchema = z.object({
  displayName: z.string().min(1),
});

export const RenameVaultSchema = z.object({
  displayName: z.string().min(1),
});

export const PutVaultSchema = z.object({
  encryptedContent: z.string().min(1),
});

export const UpdateNotificationsSchema = z.object({
  notificationPrefs: z.object({
    vaultBackup: z.enum(['none', 'weekly', 'monthly']),
  }),
});
