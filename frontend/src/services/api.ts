import type {
  ApiResponse,
  ChallengeResponse,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  UpdateProfileRequest,
  UpdateNotificationsRequest,
  NotificationPrefs,
  PasskeyChallengeResponse,
  PasskeyVerifyRequest,
  PasskeyVerifyResponse,
  PasskeyRegisterRequest,
  PasskeyRegisterResponse,
  VaultGetResponse,
  VaultPutRequest,
  VaultPutResponse,
  VaultDownloadResponse,
  VaultSummary,
  CreateVaultRequest,
  RenameVaultRequest,
  CreateUserRequest,
  CreateUserResponse,
  UpdateUserRequest,
  ListUsersResponse,
  ListLoginEventsResponse,
  AdminStats,
  WarningCodeDefinition,
} from '@passvault/shared';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import { solveChallenge } from './pow-solver.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

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

    if (powDifficulty !== undefined) {
      const challenge = await this.fetchChallenge();
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

  async updateProfile(req: UpdateProfileRequest, token: string): Promise<void> {
    return this.request(API_PATHS.AUTH_PROFILE, {
      method: 'POST',
      body: req,
      token,
    });
  }

  async logout(eventId: string, token: string): Promise<void> {
    return this.request(API_PATHS.AUTH_LOGOUT, {
      method: 'POST',
      body: { eventId },
      token,
    });
  }

  // ---- Admin Auth ------------------------------------------------------

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

  async downloadUserVault(userId: string, token: string, vaultId?: string): Promise<VaultDownloadResponse> {
    const url = vaultId
      ? `${API_PATHS.ADMIN_USER_VAULT}?userId=${encodeURIComponent(userId)}&vaultId=${encodeURIComponent(vaultId)}`
      : `${API_PATHS.ADMIN_USER_VAULT}?userId=${encodeURIComponent(userId)}`;
    return this.request<VaultDownloadResponse>(url, { method: 'GET', token, powDifficulty: POW_CONFIG.DIFFICULTY.HIGH });
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

  async lockUser(userId: string, token: string): Promise<void> {
    return this.request(API_PATHS.ADMIN_USERS_LOCK, {
      method: 'POST',
      body: { userId },
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async unlockUser(userId: string, token: string): Promise<void> {
    return this.request(API_PATHS.ADMIN_USERS_UNLOCK, {
      method: 'POST',
      body: { userId },
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async expireUser(userId: string, token: string): Promise<void> {
    return this.request(API_PATHS.ADMIN_USERS_EXPIRE, {
      method: 'POST',
      body: { userId },
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async retireUser(userId: string, token: string): Promise<void> {
    return this.request(API_PATHS.ADMIN_USERS_RETIRE, {
      method: 'POST',
      body: { userId },
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async emailUserVault(userId: string, token: string): Promise<void> {
    return this.request(API_PATHS.ADMIN_USERS_EMAIL_VAULT, {
      method: 'POST',
      body: { userId },
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async reactivateUser(userId: string, expiresAt: string | null, token: string): Promise<void> {
    return this.request(API_PATHS.ADMIN_USER_REACTIVATE, {
      method: 'POST',
      body: { userId, expiresAt },
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async updateUser(req: UpdateUserRequest, token: string): Promise<void> {
    return this.request(API_PATHS.ADMIN_USER_UPDATE, {
      method: 'POST',
      body: req,
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

  // ---- Vaults ----------------------------------------------------------

  async listVaults(token: string): Promise<VaultSummary[]> {
    return this.request<VaultSummary[]>(API_PATHS.VAULTS, {
      method: 'GET',
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async createVault(req: CreateVaultRequest, token: string): Promise<VaultSummary> {
    return this.request<VaultSummary>(API_PATHS.VAULTS, {
      method: 'POST',
      body: req,
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async deleteVault(vaultId: string, token: string): Promise<void> {
    return this.request(`${API_PATHS.VAULTS}/${encodeURIComponent(vaultId)}`, {
      method: 'DELETE',
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async getVault(vaultId: string, token: string): Promise<VaultGetResponse> {
    return this.request<VaultGetResponse>(`/api/vault/${encodeURIComponent(vaultId)}`, {
      method: 'GET',
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async putVault(vaultId: string, req: VaultPutRequest, token: string): Promise<VaultPutResponse> {
    return this.request<VaultPutResponse>(`/api/vault/${encodeURIComponent(vaultId)}`, {
      method: 'PUT',
      body: req,
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async renameVault(vaultId: string, req: RenameVaultRequest, token: string): Promise<VaultSummary> {
    return this.request<VaultSummary>(`/api/vaults/${encodeURIComponent(vaultId)}`, {
      method: 'PATCH',
      body: req,
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async downloadVault(vaultId: string, token: string): Promise<VaultDownloadResponse> {
    return this.request<VaultDownloadResponse>(`/api/vault/${encodeURIComponent(vaultId)}/download`, {
      method: 'GET',
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  async getNotificationPrefs(token: string): Promise<NotificationPrefs> {
    const res = await this.request<{ notificationPrefs: NotificationPrefs }>(API_PATHS.VAULT_NOTIFICATIONS, {
      method: 'GET',
      token,
    });
    return res.notificationPrefs;
  }

  async updateNotificationPrefs(prefs: NotificationPrefs, token: string): Promise<void> {
    return this.request(API_PATHS.VAULT_NOTIFICATIONS, {
      method: 'POST',
      body: { notificationPrefs: prefs } satisfies UpdateNotificationsRequest,
      token,
    });
  }

  async sendVaultEmail(vaultId: string, token: string): Promise<void> {
    return this.request(`/api/vault/${encodeURIComponent(vaultId)}/email`, {
      method: 'POST',
      token,
      powDifficulty: POW_CONFIG.DIFFICULTY.HIGH,
    });
  }

  // ---- Config ----------------------------------------------------------

  async getWarningCodes(): Promise<WarningCodeDefinition[]> {
    return this.request<WarningCodeDefinition[]>(API_PATHS.CONFIG_WARNING_CODES, {
      method: 'GET',
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
