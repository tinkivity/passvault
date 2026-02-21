import type {
  ApiResponse,
  ChallengeResponse,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  TotpSetupResponse,
  TotpVerifyRequest,
  TotpVerifyResponse,
  VaultGetResponse,
  VaultPutRequest,
  VaultPutResponse,
  VaultDownloadResponse,
  CreateUserRequest,
  CreateUserResponse,
  ListUsersResponse,
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

  async totpSetup(token: string): Promise<TotpSetupResponse> {
    return this.request<TotpSetupResponse>(API_PATHS.AUTH_TOTP_SETUP, {
      method: 'POST',
      token,
    });
  }

  async totpVerify(req: TotpVerifyRequest, token: string): Promise<TotpVerifyResponse> {
    return this.request<TotpVerifyResponse>(API_PATHS.AUTH_TOTP_VERIFY, {
      method: 'POST',
      body: req,
      token,
    });
  }

  // ---- Admin Auth ------------------------------------------------------

  async adminLogin(req: LoginRequest, honeypot: Record<string, string>): Promise<LoginResponse> {
    return this.request<LoginResponse>(API_PATHS.ADMIN_LOGIN, {
      method: 'POST',
      body: req,
      powDifficulty: POW_CONFIG.DIFFICULTY.MEDIUM,
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
      powDifficulty: POW_CONFIG.DIFFICULTY.MEDIUM,
    });
  }

  async adminTotpSetup(token: string): Promise<TotpSetupResponse> {
    return this.request<TotpSetupResponse>(API_PATHS.ADMIN_TOTP_SETUP, {
      method: 'POST',
      token,
    });
  }

  async adminTotpVerify(req: TotpVerifyRequest, token: string): Promise<TotpVerifyResponse> {
    return this.request<TotpVerifyResponse>(API_PATHS.ADMIN_TOTP_VERIFY, {
      method: 'POST',
      body: req,
      token,
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
    });
  }

  async downloadUserVault(userId: string, token: string): Promise<VaultDownloadResponse> {
    return this.request<VaultDownloadResponse>(
      `${API_PATHS.ADMIN_USER_VAULT}?userId=${encodeURIComponent(userId)}`,
      { method: 'GET', token },
    );
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
