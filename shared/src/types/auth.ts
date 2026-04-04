// Passkey login: passkeyToken only; password login: username + password
export interface LoginRequest {
  passkeyToken?: string;
  username?: string;
  password?: string;
}

export interface LoginResponse {
  token: string;
  userId: string;
  role: 'admin' | 'user';
  username: string;
  encryptionSalt?: string;
  plan?: import('./user.js').UserPlan;
  requirePasswordChange?: boolean;
  requirePasskeySetup?: boolean;
  accountExpired?: boolean;
  loginEventId?: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  expiresAt?: string | null;
}

export interface UpdateProfileRequest {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string;
}

export interface UpdateNotificationsRequest {
  notificationPrefs: import('./user.js').NotificationPrefs;
}

export interface ChangePasswordRequest {
  newPassword: string;
}

export interface SelfChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  offerPasskeySetup?: boolean;
}

export interface PasskeyChallengeResponse {
  challengeJwt: string;
}

export interface PasskeyAuthenticatorAssertionResponse {
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle?: string | null;
}

export interface PasskeyAssertionJSON {
  id: string;
  rawId: string;
  response: PasskeyAuthenticatorAssertionResponse;
  type: 'public-key';
  clientExtensionResults: Record<string, unknown>;
}

export interface PasskeyVerifyRequest {
  challengeJwt: string;
  assertion: PasskeyAssertionJSON;
}

export interface PasskeyVerifyResponse {
  passkeyToken: string;
  username: string;
  encryptionSalt?: string;
}

export interface PasskeyAuthenticatorAttestationResponse {
  clientDataJSON: string;
  attestationObject: string;
}

export interface PasskeyAttestationJSON {
  id: string;
  rawId: string;
  response: PasskeyAuthenticatorAttestationResponse;
  type: 'public-key';
  clientExtensionResults: Record<string, unknown>;
  transports?: string[];
}

export interface PasskeyRegisterRequest {
  challengeJwt: string;
  attestation: PasskeyAttestationJSON;
  name?: string;
}

export interface PasskeyRegisterResponse {
  success: boolean;
}

// Multi-passkey management

export interface PasskeyCredential {
  credentialId: string;
  userId: string;
  name: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
  aaguid: string;
  createdAt: string;
}

export interface PasskeyListItem {
  credentialId: string;
  name: string;
  aaguid: string;
  createdAt: string;
}

export interface PasskeyListResponse {
  passkeys: PasskeyListItem[];
}

export interface PasskeyRevokeResponse {
  success: boolean;
}
