// prod login: passkeyToken from passkey verification step; dev/beta login: username directly
export interface LoginRequest {
  passkeyToken?: string;
  username?: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  role: 'admin' | 'user';
  username: string;
  encryptionSalt: string;
  requirePasswordChange?: boolean;
  requirePasskeySetup?: boolean;
}

export interface ChangePasswordRequest {
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
}

export interface PasskeyChallengeResponse {
  challengeJwt: string;
}

export interface PasskeyAuthenticatorAssertionResponse {
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle: string | null;
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
  encryptionSalt: string;
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
}

export interface PasskeyRegisterResponse {
  success: boolean;
}
