import { useState, useCallback } from 'react';
import type { AdminStats, CreateUserRequest, ListLoginEventsResponse, UpdateUserRequest, UserSummary } from '@passvault/shared';
import { api } from '../services/api.js';

export function useAdmin(token: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createUser = useCallback(async (req: CreateUserRequest): Promise<{ username: string; oneTimePassword: string }> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const res = await api.createUser(req, token);
      return { username: res.username, oneTimePassword: res.oneTimePassword };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create user';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const listUsers = useCallback(async (): Promise<UserSummary[]> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const res = await api.listUsers(token);
      return res.users;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to list users';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const downloadUserVault = useCallback(async (userId: string, username: string, vaultId?: string): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const res = await api.downloadUserVault(userId, token, vaultId);
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `passvault-backup-${username}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download vault';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const refreshOtp = useCallback(async (userId: string): Promise<{ username: string; oneTimePassword: string }> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const res = await api.refreshOtp(userId, token);
      return { username: res.username, oneTimePassword: res.oneTimePassword };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh OTP';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const deleteUser = useCallback(async (userId: string): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.deleteUser(userId, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete user';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const getStats = useCallback(async (): Promise<AdminStats> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      return await api.getAdminStats(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load stats';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const getLoginEvents = useCallback(async (): Promise<ListLoginEventsResponse> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      return await api.getLoginEvents(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load login events';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const lockUser = useCallback(async (userId: string): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.lockUser(userId, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to lock user';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const unlockUser = useCallback(async (userId: string): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.unlockUser(userId, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to unlock user';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const expireUser = useCallback(async (userId: string): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.expireUser(userId, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to expire user';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const retireUser = useCallback(async (userId: string): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.retireUser(userId, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to retire user';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const emailUserVault = useCallback(async (userId: string, vaultId?: string): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.emailUserVault(userId, token, vaultId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send vault email';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const reactivateUser = useCallback(async (userId: string, expiresAt: string | null): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.reactivateUser(userId, expiresAt, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reactivate user';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const updateUser = useCallback(async (req: UpdateUserRequest): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.updateUser(req, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update user';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  return { loading, error, createUser, listUsers, downloadUserVault, refreshOtp, deleteUser, lockUser, unlockUser, expireUser, retireUser, reactivateUser, updateUser, emailUserVault, getStats, getLoginEvents };
}
