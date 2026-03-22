import type {
  ApiResponse,
  ChallengeResponse,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  PasskeyChallengeResponse,
  PasskeyVerifyRequest,
  PasskeyVerifyResponse,
  PasskeyRegisterRequest,
  PasskeyRegisterResponse,
  VaultGetResponse,
  VaultPutRequest,
  VaultPutResponse,
  VaultDownloadResponse,
  CreateUserRequest,
  CreateUserResponse,
  ListUsersResponse,
  ListLoginEventsResponse,
  AdminStats,
} from '@passvault/shared';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import { solveChallenge } from './pow-solver.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  token?: string;
  /** PoW difficulty level — undefined means no PoW needed */
  powDifficulty?: number;
  honeypotFields?: Record<string, string>;
}

export class ApiClient {
  private async fetchChallenge(): Promise<ChallengeResponse> {
    const res = await fetch(`${API_BASE}${API_PATHS.CHALLENGE}`);
    if (!res.ok) throw new Error('Failed to fetch PoW challenge');
    const json: ApiResponse<ChallengeResponse> = await res.json();
    if (!json.success || !json.data) throw new Error(json.error ?? 'Challenge error');
    return json.data;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, token, powDifficulty, honeypotFields } = options;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Auto-solve PoW when needed
    if (powDifficulty !== undefined) {
      const challenge = await this.fetchChallenge();
      // Override challenge difficulty with what we expect (server enforces actual)
      const pow = await solveChallenge({ ...challenge, difficulty: powDifficulty });
      Object.assign(headers, pow);
    }

    const requestBody = honeypotFields
      ? JSON.stringify({ ...honeypotFields, ...(body as object) })
      : body !== undefined ? JSON.stringify(body) : undefined;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: requestBody,
    });

    const json: ApiResponse<T> = await res.json();

    if (!res.ok || !json.success) {
      throw new ApiError(json.error ?? `HTTP ${res.status}`, res.status);
    }

    return json.data as T;
  }

  // ---- Challenge -------------------------------------------------------

  async getChallenge(): Promise<ChallengeResponse> {
    return this.fetchChallenge();
  }

  // ---- Auth ------------------------------------------------------------

  async login(req: LoginRequest, honeypot: Record<string, string>): Promise<LoginResponse> {
    return this.request<LoginResponse>(API_PATHS.AUTH_LOGIN, {
      method: 'POST',
      body: req,
      powDifficulty: POW_CONFIG.DIFFICULTY.MEDIUM,
      honeypotFields: honeypot,
    });
  }

  async changePassword(
    req: ChangePasswordRequest,
    token: string,
  ): Promise<ChangePasswordResponse> {
    return this.request<ChangePasswordResponse>(API_PATHS.AUTH_CHANGE_PASSWORD, {
      method: 'POST',
      body: req,
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.MEDIUM,
    });
  }

  async getPasskeyChallenge(): Promise<PasskeyChallengeResponse> {
    return this.request<PasskeyChallengeResponse>(API_PATHS.AUTH_PASSKEY_CHALLENGE, {
      method: 'GET',
    });
  }

  async verifyPasskey(
    req: PasskeyVerifyRequest,
    honeypot: Record<string, string>,
  ): Promise<PasskeyVerifyResponse> {
    return this.request<PasskeyVerifyResponse>(API_PATHS.AUTH_PASSKEY_VERIFY, {
      method: 'POST',
      body: req,
      powDifficulty: POW_CONFIG.DIFFICULTY.MEDIUM,
      honeypotFields: honeypot,
    });
  }

  async getPasskeyRegisterChallenge(token: string): Promise<PasskeyChallengeResponse> {
    return this.request<PasskeyChallengeResponse>(API_PATHS.AUTH_PASSKEY_REGISTER_CHALLENGE, {
      method: 'GET',
      token,
    });
  }

  async registerPasskey(
    req: PasskeyRegisterRequest,
    token: string,
  ): Promise<PasskeyRegisterResponse> {
    return this.request<PasskeyRegisterResponse>(API_PATHS.AUTH_PASSKEY_REGISTER, {
      method: 'POST',
      body: req,
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.MEDIUM,
    });
  }

  // ---- Admin Auth ------------------------------------------------------

  async adminLogin(req: LoginRequest, honeypot: Record<string, string>): Promise<LoginResponse> {
    return this.request<LoginResponse>(API_PATHS.ADMIN_LOGIN, {
      method: 'POST',
      body: req,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
      honeypotFields: honeypot,
    });
  }

  async adminChangePassword(
    req: ChangePasswordRequest,
    token: string,
  ): Promise<ChangePasswordResponse> {
    return this.request<ChangePasswordResponse>(API_PATHS.ADMIN_CHANGE_PASSWORD, {
      method: 'POST',
      body: req,
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async getAdminPasskeyChallenge(): Promise<PasskeyChallengeResponse> {
    return this.request<PasskeyChallengeResponse>(API_PATHS.ADMIN_PASSKEY_CHALLENGE, {
      method: 'GET',
    });
  }

  async verifyAdminPasskey(
    req: PasskeyVerifyRequest,
    honeypot: Record<string, string>,
  ): Promise<PasskeyVerifyResponse> {
    return this.request<PasskeyVerifyResponse>(API_PATHS.ADMIN_PASSKEY_VERIFY, {
      method: 'POST',
      body: req,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
      honeypotFields: honeypot,
    });
  }

  async getAdminPasskeyRegisterChallenge(token: string): Promise<PasskeyChallengeResponse> {
    return this.request<PasskeyChallengeResponse>(API_PATHS.ADMIN_PASSKEY_REGISTER_CHALLENGE, {
      method: 'GET',
      token,
    });
  }

  async registerAdminPasskey(
    req: PasskeyRegisterRequest,
    token: string,
  ): Promise<PasskeyRegisterResponse> {
    return this.request<PasskeyRegisterResponse>(API_PATHS.ADMIN_PASSKEY_REGISTER, {
      method: 'POST',
      body: req,
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  // ---- Admin Users -----------------------------------------------------

  async createUser(req: CreateUserRequest, token: string): Promise<CreateUserResponse> {
    return this.request<CreateUserResponse>(API_PATHS.ADMIN_USERS, {
      method: 'POST',
      body: req,
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async listUsers(token: string): Promise<ListUsersResponse> {
    return this.request<ListUsersResponse>(API_PATHS.ADMIN_USERS, {
      method: 'GET',
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async downloadUserVault(userId: string, token: string): Promise<VaultDownloadResponse> {
    return this.request<VaultDownloadResponse>(
      `${API_PATHS.ADMIN_USER_VAULT}?userId=${encodeURIComponent(userId)}`,
      { method: 'GET', token, powDifficulty: POW_CONFIG.DIFFICULTY.HIGH },
    );
  }

  async refreshOtp(userId: string, token: string): Promise<{ username: string; oneTimePassword: string; userId: string }> {
    return this.request(`${API_PATHS.ADMIN_USER_REFRESH_OTP}`, {
      method: 'POST',
      body: { userId },
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async deleteUser(userId: string, token: string): Promise<void> {
    return this.request(`${API_PATHS.ADMIN_USERS}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async getAdminStats(token: string): Promise<AdminStats> {
    return this.request<AdminStats>(API_PATHS.ADMIN_STATS, {
      method: 'GET',
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async getLoginEvents(token: string): Promise<ListLoginEventsResponse> {
    return this.request<ListLoginEventsResponse>(API_PATHS.ADMIN_LOGIN_EVENTS, {
      method: 'GET',
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async logout(eventId: string, token: string): Promise<void> {
    return this.request(API_PATHS.AUTH_LOGOUT, {
      method: 'POST',
      body: { eventId },
      token,
    });
  }

  // ---- Vault -----------------------------------------------------------

  async getVault(token: string): Promise<VaultGetResponse> {
    return this.request<VaultGetResponse>(API_PATHS.VAULT, {
      method: 'GET',
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async putVault(req: VaultPutRequest, token: string): Promise<VaultPutResponse> {
    return this.request<VaultPutResponse>(API_PATHS.VAULT, {
      method: 'PUT',
      body: req,
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async downloadVault(token: string): Promise<VaultDownloadResponse> {
    return this.request<VaultDownloadResponse>(API_PATHS.VAULT_DOWNLOAD, {
      method: 'GET',
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async sendVaultEmail(token: string): Promise<void> {
    return this.request(API_PATHS.VAULT_SEND_EMAIL, {
      method: 'POST',
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async requestEmailChange(newEmail: string, password: string, token: string): Promise<void> {
    return this.request(API_PATHS.AUTH_EMAIL_CHANGE, {
      method: 'POST',
      body: { newEmail, password },
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.MEDIUM,
    });
  }

  async confirmEmailChange(code: string, token: string): Promise<void> {
    return this.request(API_PATHS.AUTH_EMAIL_VERIFY, {
      method: 'POST',
      body: { code },
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.MEDIUM,
    });
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Singleton instance
export const api = new ApiClient();
