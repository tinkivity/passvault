import { useState, useCallback } from 'react';
import type { ChangePasswordRequest, PasskeyVerifyResponse } from '@passvault/shared';
import { useAuthContext } from '../context/AuthContext.js';
import { useEncryptionContext } from '../context/EncryptionContext.js';
import { api } from '../services/api.js';
import { authenticateWithPasskey } from '../services/passkey.js';
import { createHoneypot, getHoneypotFields } from '../services/honeypot.js';

export function useAuth() {
  const { token, role, username, status, loginEventId, setAuth, clearAuth } = useAuthContext();
  const { deriveKey, clearKey } = useEncryptionContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // prod step 4-6: password + passkeyToken → session JWT
  const completeLogin = useCallback(async (
    passkeyToken: string,
    password: string,
    encryptionSalt: string,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const honeypot = createHoneypot();
      const res = await api.login({ passkeyToken, password }, getHoneypotFields(honeypot));

      await deriveKey(password, encryptionSalt);

      setAuth({
        token: res.token,
        role: res.role,
        username: res.username,
        status: res.requirePasswordChange
          ? 'pending_first_login'
          : res.requirePasskeySetup
            ? 'pending_passkey_setup'
            : 'active',
        encryptionSalt,
        loginEventId: res.loginEventId ?? null,
      });

      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setAuth, deriveKey]);

  // dev/beta direct login: username + password
  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const honeypot = createHoneypot();
      const res = await api.login({ username, password }, getHoneypotFields(honeypot));

      await deriveKey(password, res.encryptionSalt);

      setAuth({
        token: res.token,
        role: res.role,
        username: res.username,
        status: res.requirePasswordChange ? 'pending_first_login' : 'active',
        encryptionSalt: res.encryptionSalt,
        loginEventId: res.loginEventId ?? null,
      });

      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setAuth, deriveKey]);

  // prod step 1-3 for admin passkeys
  const startAdminPasskeyLogin = useCallback(async (): Promise<PasskeyVerifyResponse> => {
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

  // prod step 4-6 for admin
  const completeAdminLogin = useCallback(async (
    passkeyToken: string,
    password: string,
    encryptionSalt: string,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const honeypot = createHoneypot();
      const res = await api.adminLogin({ passkeyToken, password }, getHoneypotFields(honeypot));

      setAuth({
        token: res.token,
        role: res.role,
        username: res.username,
        status: res.requirePasswordChange
          ? 'pending_first_login'
          : res.requirePasskeySetup
            ? 'pending_passkey_setup'
            : 'active',
        encryptionSalt,
        loginEventId: res.loginEventId ?? null,
      });

      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setAuth]);

  // dev/beta direct admin login
  const adminLogin = useCallback(async (adminUsername: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const honeypot = createHoneypot();
      const res = await api.adminLogin({ username: adminUsername, password }, getHoneypotFields(honeypot));

      setAuth({
        token: res.token,
        role: res.role,
        username: res.username,
        status: res.requirePasswordChange ? 'pending_first_login' : 'active',
        encryptionSalt: res.encryptionSalt,
        loginEventId: res.loginEventId ?? null,
      });

      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setAuth]);

  const changePassword = useCallback(async (req: ChangePasswordRequest) => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.changePassword(req, token);
      // Re-derive key with new password using existing salt
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
      await api.adminChangePassword(req, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Password change failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const requestEmailChange = useCallback(async (newEmail: string, password: string) => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.requestEmailChange(newEmail, password, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to request email change';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const confirmEmailChange = useCallback(async (code: string) => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.confirmEmailChange(code, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to confirm email change';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const logout = useCallback(() => {
    if (token && loginEventId) {
      api.logout(loginEventId, token).catch(() => { /* best-effort */ });
    }
    clearKey();
    clearAuth();
  }, [clearAuth, clearKey, token, loginEventId]);

  return {
    token,
    role,
    username,
    status,
    loading,
    error,
    // prod passkey flow
    startPasskeyLogin,
    completeLogin,
    startAdminPasskeyLogin,
    completeAdminLogin,
    // dev/beta direct flow
    login,
    adminLogin,
    // shared
    changePassword,
    adminChangePassword,
    requestEmailChange,
    confirmEmailChange,
    logout,
  };
}
