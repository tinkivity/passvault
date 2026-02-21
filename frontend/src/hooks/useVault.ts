import { useState, useCallback } from 'react';
import { api } from '../services/api.js';
import { useEncryptionContext } from '../context/EncryptionContext.js';

export function useVault(token: string | null) {
  const { encrypt, decrypt } = useEncryptionContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastModified, setLastModified] = useState<string | null>(null);

  const fetchAndDecrypt = useCallback(async (): Promise<string> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const res = await api.getVault(token);
      setLastModified(res.lastModified);
      if (!res.encryptedContent) return '';
      return await decrypt(res.encryptedContent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load vault';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token, decrypt]);

  const encryptAndSave = useCallback(async (plaintext: string): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const encryptedContent = await encrypt(plaintext);
      const res = await api.putVault({ encryptedContent }, token);
      setLastModified(res.lastModified);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save vault';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token, encrypt]);

  const download = useCallback(async (): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const res = await api.downloadVault(token);
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `passvault-backup-${new Date().toISOString().slice(0, 10)}.json`;
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

  return { loading, error, lastModified, fetchAndDecrypt, encryptAndSave, download };
}
