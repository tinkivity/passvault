import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChangePasswordRequest, SelfChangePasswordRequest, PasskeyVerifyResponse, UpdateProfileRequest, LoginResponse, UserStatus } from '@passvault/shared';
import { useAuthContext } from '../context/AuthContext.js';
import { useEncryptionContext } from '../context/EncryptionContext.js';
import { api } from '../services/api.js';
import { authenticateWithPasskey } from '../services/passkey.js';
import { createHoneypot, getHoneypotFields } from '../services/honeypot.js';

function deriveStatus(res: LoginResponse): UserStatus {
  if (res.requirePasswordChange) return 'pending_first_login';
  if (res.requirePasskeySetup) return 'pending_passkey_setup';
  if (res.accountExpired) return 'expired';
  return 'active';
}

export function useAuth() {
  const { token, userId, role, username, firstName, lastName, displayName, status, plan, loginEventId, expiresAt, accountExpired, setAuth, clearAuth, patchAuth } = useAuthContext();
  const { clearKey } = useEncryptionContext();
  const { i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyLanguagePreference = useCallback((preferredLanguage?: string) => {
    if (preferredLanguage && preferredLanguage !== 'auto') {
      localStorage.setItem('pv_language', preferredLanguage);
      void i18n.changeLanguage(preferredLanguage);
    }
  }, [i18n]);

  // prod step 1-3: passkey challenge → browser dialog → verify → intermediate result
  const startPasskeyLogin = useCallback(async (): Promise<PasskeyVerifyResponse> => {
    setLoading(true);
    setError(null);
    try {
      const { challengeJwt } = await api.getPasskeyChallenge();
      const honeypot = createHoneypot();
      const assertion = await authenticateWithPasskey(challengeJwt);
      return await api.verifyPasskey(
        { challengeJwt, assertion },
        getHoneypotFields(honeypot),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey authentication failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Passkey login: passkeyToken required, password optional (users skip it, admins provide it)
  const completeLogin = useCallback(async (
    passkeyToken: string,
    password?: string,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const honeypot = createHoneypot();
      const res = await api.login({ passkeyToken, password }, getHoneypotFields(honeypot));

      setAuth({
        token: res.token,
        userId: res.userId,
        role: res.role,
        username: res.username,
        firstName: res.firstName ?? null,
        lastName: res.lastName ?? null,
        displayName: res.displayName ?? null,
        status: deriveStatus(res),
        plan: res.plan ?? null,
        loginEventId: res.loginEventId ?? null,
        expiresAt: res.expiresAt ?? null,
        accountExpired: res.accountExpired ?? false,
      });

      applyLanguagePreference(res.preferredLanguage);
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setAuth, applyLanguagePreference]);

  // Direct login: username + password
  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const honeypot = createHoneypot();
      const res = await api.login({ username, password }, getHoneypotFields(honeypot));

      setAuth({
        token: res.token,
        userId: res.userId,
        role: res.role,
        username: res.username,
        firstName: res.firstName ?? null,
        lastName: res.lastName ?? null,
        displayName: res.displayName ?? null,
        status: deriveStatus(res),
        plan: res.plan ?? null,
        loginEventId: res.loginEventId ?? null,
        expiresAt: res.expiresAt ?? null,
        accountExpired: res.accountExpired ?? false,
      });

      applyLanguagePreference(res.preferredLanguage);
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setAuth, applyLanguagePreference]);

  const changePassword = useCallback(async (req: ChangePasswordRequest) => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      return await api.changePassword(req, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Password change failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const updateProfile = useCallback(async (req: UpdateProfileRequest) => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.updateProfile(req, token);
      patchAuth({
        ...(('firstName' in req) && { firstName: req.firstName ?? null }),
        ...(('lastName' in req) && { lastName: req.lastName ?? null }),
        ...(('displayName' in req) && { displayName: req.displayName ?? null }),
        ...(req.email !== undefined && { username: req.email }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Profile update failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token, patchAuth]);

  const selfChangePassword = useCallback(async (req: SelfChangePasswordRequest) => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.selfChangePassword(req, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Password change failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const adminChangePassword = useCallback(async (req: ChangePasswordRequest) => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      return await api.adminChangePassword(req, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Password change failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Admin two-step login, step 2a: passkey challenge → browser dialog → verify → passkeyToken
  const startAdminPasskeyVerification = useCallback(async (): Promise<PasskeyVerifyResponse> => {
    setLoading(true);
    setError(null);
    try {
      const { challengeJwt } = await api.getAdminPasskeyChallenge();
      const honeypot = createHoneypot();
      const assertion = await authenticateWithPasskey(challengeJwt);
      return await api.verifyAdminPasskey(
        { challengeJwt, assertion },
        getHoneypotFields(honeypot),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey authentication failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Admin two-step login, step 2b: POST /api/admin/login with passkeyToken + password
  const completeAdminLogin = useCallback(async (passkeyToken: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const honeypot = createHoneypot();
      const res = await api.adminLogin({ passkeyToken, password }, getHoneypotFields(honeypot));

      setAuth({
        token: res.token,
        userId: res.userId,
        role: res.role,
        username: res.username,
        firstName: res.firstName ?? null,
        lastName: res.lastName ?? null,
        displayName: res.displayName ?? null,
        status: deriveStatus(res),
        plan: res.plan ?? null,
        loginEventId: res.loginEventId ?? null,
        expiresAt: res.expiresAt ?? null,
        accountExpired: res.accountExpired ?? false,
      });

      applyLanguagePreference(res.preferredLanguage);
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setAuth, applyLanguagePreference]);

  const logout = useCallback(() => {
    if (token && loginEventId) {
      api.logout(loginEventId, token).catch(() => { /* best-effort */ });
    }
    clearKey();
    clearAuth();
    localStorage.removeItem('pv_language');
    void i18n.changeLanguage();
  }, [clearAuth, clearKey, token, loginEventId, i18n]);

  return {
    token,
    userId,
    role,
    username,
    expiresAt,
    accountExpired,
    firstName,
    lastName,
    displayName,
    status,
    plan,
    loading,
    error,
    // user passkey flow
    startPasskeyLogin,
    completeLogin,
    // admin two-step flow (beta/prod)
    startAdminPasskeyVerification,
    completeAdminLogin,
    // direct flow
    login,
    // shared
    changePassword,
    selfChangePassword,
    updateProfile,
    adminChangePassword,
    logout,
  };
}
