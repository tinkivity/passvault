import { useState, useCallback } from 'react';
const randomUUID = () => crypto.randomUUID();
import type { VaultFile, VaultItem, WarningCode } from '@passvault/shared';
import { validatePassword } from '@passvault/shared';
import { api } from '../services/api.js';
import { useEncryptionContext } from '../context/EncryptionContext.js';

// ---- Warning computation -----------------------------------------------

export function computeWarnings(items: VaultItem[]): VaultItem[] {
  // Collect all passwords from login / email / wifi items
  const passwordMap = new Map<string, string[]>(); // password → [itemId, ...]
  for (const item of items) {
    let pw: string | undefined;
    if (item.category === 'login') pw = item.password;
    else if (item.category === 'email') pw = item.password;
    else if (item.category === 'wifi') pw = item.password;
    if (pw) {
      const ids = passwordMap.get(pw) ?? [];
      ids.push(item.id);
      passwordMap.set(pw, ids);
    }
  }

  const duplicates = new Set<string>();
  for (const ids of passwordMap.values()) {
    if (ids.length > 1) ids.forEach(id => duplicates.add(id));
  }

  return items.map(item => {
    const codes: WarningCode[] = [];

    // duplicate_password
    if (duplicates.has(item.id)) {
      codes.push('duplicate_password');
    }

    // too_simple_password
    if (item.category === 'login' || item.category === 'email' || item.category === 'wifi') {
      const pw = (item as { password: string }).password;
      if (pw && !validatePassword(pw).valid) {
        codes.push('too_simple_password');
      }
    }

    return { ...item, warningCodes: codes };
  });
}

// ---- Migration ---------------------------------------------------------

function migrateToVaultFile(raw: string): VaultFile {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.items)) {
      return parsed as VaultFile;
    }
  } catch {
    // fall through to migration
  }

  // Legacy: treat entire content as a note
  const now = new Date().toISOString();
  return {
    version: 1,
    items: [
      {
        id: randomUUID(),
        name: 'My Notes',
        category: 'note',
        format: 'raw',
        text: raw,
        createdAt: now,
        updatedAt: now,
        warningCodes: [],
      },
    ],
  };
}

// ---- Hook --------------------------------------------------------------

export function useVault(vaultId: string | null, token: string | null) {
  const { encrypt, decrypt } = useEncryptionContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastModified, setLastModified] = useState<string | null>(null);
  const [rawEncryptedContent, setRawEncryptedContent] = useState<string | null>(null);

  const fetchAndDecrypt = useCallback(async (): Promise<VaultFile> => {
    if (!token || !vaultId) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const res = await api.getVault(vaultId, token);
      setLastModified(res.lastModified);
      setRawEncryptedContent(res.encryptedContent ?? null);
      if (!res.encryptedContent) {
        return { version: 1, items: [] };
      }
      const plaintext = await decrypt(res.encryptedContent);
      const vaultFile = migrateToVaultFile(plaintext);

      // Recompute warnings on load in case any items are missing them
      const withWarnings = { ...vaultFile, items: computeWarnings(vaultFile.items) };

      // Re-save silently if warnings changed
      const warningsChanged = withWarnings.items.some((item, i) =>
        JSON.stringify(item.warningCodes) !== JSON.stringify(vaultFile.items[i]?.warningCodes),
      );
      if (warningsChanged) {
        const encryptedContent = await encrypt(JSON.stringify(withWarnings));
        const putRes = await api.putVault(vaultId, { encryptedContent }, token);
        setLastModified(putRes.lastModified);
      }

      return withWarnings;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load vault';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [vaultId, token, decrypt, encrypt]);

  const save = useCallback(async (vaultFile: VaultFile): Promise<VaultFile> => {
    if (!token || !vaultId) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const withWarnings: VaultFile = { ...vaultFile, items: computeWarnings(vaultFile.items) };
      const encryptedContent = await encrypt(JSON.stringify(withWarnings));
      const res = await api.putVault(vaultId, { encryptedContent }, token);
      setLastModified(res.lastModified);
      return withWarnings;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save vault';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [vaultId, token, encrypt]);

  const addItem = useCallback(async (vaultFile: VaultFile, item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt' | 'warningCodes'>): Promise<VaultFile> => {
    const now = new Date().toISOString();
    const newItem = { ...item, id: randomUUID(), createdAt: now, updatedAt: now, warningCodes: [] } as unknown as VaultItem;
    return save({ ...vaultFile, items: [...vaultFile.items, newItem] });
  }, [save]);

  const updateItem = useCallback(async (vaultFile: VaultFile, updated: VaultItem): Promise<VaultFile> => {
    const now = new Date().toISOString();
    const items = vaultFile.items.map(item =>
      item.id === updated.id ? { ...updated, updatedAt: now } : item,
    );
    return save({ ...vaultFile, items });
  }, [save]);

  const deleteItem = useCallback(async (vaultFile: VaultFile, itemId: string): Promise<VaultFile> => {
    return save({ ...vaultFile, items: vaultFile.items.filter(item => item.id !== itemId) });
  }, [save]);

  const download = useCallback(async (displayName: string): Promise<void> => {
    if (!token || !vaultId) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const res = await api.downloadVault(vaultId, token);
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = displayName.replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `passvault-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download vault';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [vaultId, token]);

  const sendEmail = useCallback(async (): Promise<void> => {
    if (!token || !vaultId) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      await api.sendVaultEmail(vaultId, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send vault email';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [vaultId, token]);

  return { loading, error, lastModified, rawEncryptedContent, fetchAndDecrypt, save, addItem, updateItem, deleteItem, download, sendEmail };
}
