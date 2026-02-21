import { useState, useCallback } from 'react';
import type { LoginRequest, ChangePasswordRequest } from '@passvault/shared';
import { useAuthContext } from '../context/AuthContext.js';
import { useEncryptionContext } from '../context/EncryptionContext.js';
import { api } from '../services/api.js';
import { createHoneypot, getHoneypotFields } from '../services/honeypot.js';

export function useAuth() {
  const { token, role, username, status, setAuth, clearAuth } = useAuthContext();
  const { deriveKey, clearKey } = useEncryptionContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (req: LoginRequest) => {
    setLoading(true);
    setError(null);
    try {
      const honeypot = createHoneypot();
      const res = await api.login(req, getHoneypotFields(honeypot));

      // Derive encryption key from password + salt before storing token
      await deriveKey(req.password, res.encryptionSalt);

      setAuth({
        token: res.token,
        role: res.role,
        username: res.username,
        status: res.requirePasswordChange
          ? 'pending_first_login'
          : res.requireTotpSetup
            ? 'pending_totp_setup'
            : 'active',
        encryptionSalt: res.encryptionSalt,
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

  const adminLogin = useCallback(async (req: LoginRequest) => {
    setLoading(true);
    setError(null);
    try {
      const honeypot = createHoneypot();
      const res = await api.adminLogin(req, getHoneypotFields(honeypot));

      setAuth({
        token: res.token,
        role: res.role,
        username: res.username,
        status: res.requirePasswordChange
          ? 'pending_first_login'
          : res.requireTotpSetup
            ? 'pending_totp_setup'
            : 'active',
        encryptionSalt: res.encryptionSalt,
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

  const logout = useCallback(() => {
    clearKey();
    clearAuth();
  }, [clearAuth, clearKey]);

  return {
    token,
    role,
    username,
    status,
    loading,
    error,
    login,
    adminLogin,
    changePassword,
    adminChangePassword,
    logout,
  };
}
