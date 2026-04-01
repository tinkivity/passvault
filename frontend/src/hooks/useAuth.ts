import { useState, useCallback } from 'react';
import type { ChangePasswordRequest, SelfChangePasswordRequest, PasskeyVerifyResponse, UpdateProfileRequest } from '@passvault/shared';
import { useAuthContext } from '../context/AuthContext.js';
import { useEncryptionContext } from '../context/EncryptionContext.js';
import { api } from '../services/api.js';
import { authenticateWithPasskey } from '../services/passkey.js';
import { createHoneypot, getHoneypotFields } from '../services/honeypot.js';

export function useAuth() {
  const { token, role, username, firstName, lastName, displayName, status, plan, loginEventId, setAuth, clearAuth, patchAuth } = useAuthContext();
  const { clearKey } = useEncryptionContext();
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
  ) => {
    setLoading(true);
    setError(null);
    try {
      const honeypot = createHoneypot();
      const res = await api.login({ passkeyToken, password }, getHoneypotFields(honeypot));

      setAuth({
        token: res.token,
        role: res.role,
        username: res.username,
        firstName: res.firstName ?? null,
        lastName: res.lastName ?? null,
        displayName: res.displayName ?? null,
        status: res.requirePasswordChange
          ? 'pending_first_login'
          : res.requirePasskeySetup
            ? 'pending_passkey_setup'
            : 'active',
        plan: res.plan ?? null,
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

  // dev/beta direct login: username + password (works for both user and admin roles)
  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const honeypot = createHoneypot();
      const res = await api.login({ username, password }, getHoneypotFields(honeypot));

      setAuth({
        token: res.token,
        role: res.role,
        username: res.username,
        firstName: res.firstName ?? null,
        lastName: res.lastName ?? null,
        displayName: res.displayName ?? null,
        status: res.requirePasswordChange ? 'pending_first_login' : 'active',
        plan: res.plan ?? null,
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
      await api.adminChangePassword(req, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Password change failed';
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
    firstName,
    lastName,
    displayName,
    status,
    plan,
    loading,
    error,
    // prod passkey flow
    startPasskeyLogin,
    completeLogin,
    // dev/beta direct flow
    login,
    // shared
    changePassword,
    selfChangePassword,
    updateProfile,
    adminChangePassword,
    logout,
  };
}
