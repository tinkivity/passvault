import { useState, useCallback } from 'react';
import type { UserSummary } from '@passvault/shared';
import { api } from '../services/api.js';

export function useAdmin(token: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createUser = useCallback(async (username: string): Promise<{ username: string; oneTimePassword: string }> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const res = await api.createUser({ username }, token);
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

  const downloadUserVault = useCallback(async (userId: string, username: string): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const res = await api.downloadUserVault(userId, token);
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

  return { loading, error, createUser, listUsers, downloadUserVault };
}
