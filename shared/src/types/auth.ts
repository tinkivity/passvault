export interface LoginRequest {
  username: string;
  password: string;
  totpCode?: string;
}

export interface LoginResponse {
  token: string;
  role: 'admin' | 'user';
  username: string;
  encryptionSalt: string;
  requirePasswordChange?: boolean;
  requireTotpSetup?: boolean;
}

export interface ChangePasswordRequest {
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
}

export interface TotpSetupResponse {
  secret: string;
  qrCodeUrl: string;
}

export interface TotpVerifyRequest {
  totpCode: string;
}

export interface TotpVerifyResponse {
  success: boolean;
}
