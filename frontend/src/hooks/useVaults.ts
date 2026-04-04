import { useState, useCallback } from 'react';
import type { VaultSummary } from '@passvault/shared';
import { api } from '../services/api.js';

export function useVaults(token: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVaults = useCallback(async (): Promise<VaultSummary[]> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      return await api.listVaults(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load vaults';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const createVault = useCallback(async (displayName: string, source?: 'import'): Promise<VaultSummary> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      return await api.createVault({ displayName, ...(source && { source }) }, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create vault';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const deleteVault = useCallback(async (vaultId: string): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.deleteVault(vaultId, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete vault';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  return { loading, error, fetchVaults, createVault, deleteVault };
}
