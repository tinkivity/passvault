import { validatePassword as sharedValidatePassword, type PasswordValidationResult } from '@passvault/shared';

export function validatePassword(password: string, username?: string): PasswordValidationResult {
  return sharedValidatePassword(password, username);
}
