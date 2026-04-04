import { useState, useCallback, useRef } from 'react';
const randomUUID = () => crypto.randomUUID();
import type { VaultIndexFile, VaultIndexEntry, VaultItemsFile, VaultItem, VaultItemCategory, WarningCode } from '@passvault/shared';
import { validatePassword } from '@passvault/shared';
import { api } from '../services/api.js';
import { useEncryptionContext } from '../context/EncryptionContext.js';
import { checkBreachedPasswords } from '../services/hibp.js';

// ---- Warning computation -----------------------------------------------

/** Extract the checkable password from a vault item (if any). */
function getCheckablePassword(item: VaultItem): string | undefined {
  switch (item.category) {
    case 'login':
    case 'email':
    case 'wifi':
      return item.password;
    case 'private_key':
      // Check passphrase only — privateKey must NOT be sent to HIBP
      return item.passphrase || undefined;
    default:
      return undefined;
  }
}

export async function computeWarnings(items: VaultItem[]): Promise<VaultItem[]> {
  // Collect all passwords from login / email / wifi / private_key(passphrase) items
  const passwordMap = new Map<string, string[]>(); // password → [itemId, ...]
  for (const item of items) {
    const pw = getCheckablePassword(item);
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

  // HIBP breach check (k-Anonymity — only 5-char SHA-1 prefix leaves the client)
  const allPasswords = [...passwordMap.keys()];
  const breachedMap = await checkBreachedPasswords(allPasswords);

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

    // breached_password
    const pw = getCheckablePassword(item);
    if (pw && breachedMap.get(pw)) {
      codes.push('breached_password');
    }

    return { ...item, warningCodes: codes };
  });
}

// ---- Helpers for building index entries from items ----------------------

function buildIndexEntry(item: VaultItem): VaultIndexEntry {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    warningCodes: item.warningCodes,
    comment: item.comment,
  };
}

function buildIndexFile(items: VaultItem[]): VaultIndexFile {
  return {
    version: 2,
    entries: items.map(buildIndexEntry),
  };
}

function buildItemsFile(items: VaultItem[]): VaultItemsFile {
  const record: Record<string, VaultItem> = {};
  for (const item of items) {
    record[item.id] = item;
  }
  return { version: 2, items: record };
}

// ---- Migration ---------------------------------------------------------

function migrateItemsFromLegacy(raw: string): VaultItem[] {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.items)) {
      return parsed.items as VaultItem[];
    }
    // version 2 items file
    if (parsed && parsed.version === 2 && parsed.items && typeof parsed.items === 'object' && !Array.isArray(parsed.items)) {
      return Object.values(parsed.items) as VaultItem[];
    }
  } catch {
    // fall through to migration
  }

  // Legacy: treat entire content as a note
  const now = new Date().toISOString();
  return [
    {
      id: randomUUID(),
      name: 'My Notes',
      category: 'note' as VaultItemCategory,
      format: 'raw',
      text: raw,
      createdAt: now,
      updatedAt: now,
      warningCodes: [],
    } as VaultItem,
  ];
}

function parseIndexFile(raw: string): VaultIndexEntry[] {
  try {
    const parsed = JSON.parse(raw) as VaultIndexFile;
    if (parsed && parsed.version === 2 && Array.isArray(parsed.entries)) {
      return parsed.entries;
    }
  } catch {
    // empty or invalid
  }
  return [];
}

function parseItemsFile(raw: string): Record<string, VaultItem> {
  try {
    const parsed: unknown = JSON.parse(raw);
    const obj = parsed as { version?: number; items?: unknown };
    if (obj && obj.version === 2 && obj.items && typeof obj.items === 'object' && !Array.isArray(obj.items)) {
      return obj.items as Record<string, VaultItem>;
    }
    // Legacy VaultFile (version 1)
    if (obj && obj.version === 1 && Array.isArray(obj.items)) {
      const record: Record<string, VaultItem> = {};
      for (const item of obj.items as VaultItem[]) {
        record[item.id] = item;
      }
      return record;
    }
  } catch {
    // empty or invalid
  }
  return {};
}

// ---- Hook --------------------------------------------------------------

export function useVault(vaultId: string | null, token: string | null) {
  const { encrypt, decrypt } = useEncryptionContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastModified, setLastModified] = useState<string | null>(null);
  const [rawEncryptedItems, setRawEncryptedItems] = useState<string | null>(null);

  // In-memory cache of decrypted items (keyed by item ID)
  const itemsCacheRef = useRef<Record<string, VaultItem> | null>(null);

  /** Fetch and decrypt the index file only — returns index entries. */
  const fetchIndex = useCallback(async (): Promise<VaultIndexEntry[]> => {
    if (!token || !vaultId) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const res = await api.getVaultIndex(vaultId, token);
      setLastModified(res.lastModified);
      if (!res.encryptedIndex) {
        return [];
      }
      const plaintext = await decrypt(vaultId, res.encryptedIndex);
      return parseIndexFile(plaintext);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load vault index';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [vaultId, token, decrypt]);

  /** Fetch and decrypt items file, cache in memory. Returns the item by ID. */
  const fetchItem = useCallback(async (itemId: string): Promise<VaultItem | undefined> => {
    if (!token || !vaultId) throw new Error('Not authenticated');

    // If items are already cached, return directly
    if (itemsCacheRef.current) {
      return itemsCacheRef.current[itemId];
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.getVaultItems(vaultId, token);
      setRawEncryptedItems(res.encryptedItems ?? null);
      if (!res.encryptedItems) {
        itemsCacheRef.current = {};
        return undefined;
      }
      const plaintext = await decrypt(vaultId, res.encryptedItems);
      itemsCacheRef.current = parseItemsFile(plaintext);
      return itemsCacheRef.current[itemId];
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load vault items';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [vaultId, token, decrypt]);

  /** Fetch both index and items, return all items (for legacy callers like new/edit pages). */
  const fetchAllItems = useCallback(async (): Promise<VaultItem[]> => {
    if (!token || !vaultId) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const res = await api.getVault(vaultId, token);
      setLastModified(res.lastModified);
      setRawEncryptedItems(res.encryptedItems ?? null);

      let items: VaultItem[];
      if (!res.encryptedItems) {
        items = [];
        itemsCacheRef.current = {};
      } else {
        const itemsPlaintext = await decrypt(vaultId, res.encryptedItems);
        items = migrateItemsFromLegacy(itemsPlaintext);
        // Recompute warnings (async — includes HIBP breach check)
        items = await computeWarnings(items);
        const record: Record<string, VaultItem> = {};
        for (const item of items) record[item.id] = item;
        itemsCacheRef.current = record;
      }

      return items;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load vault';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [vaultId, token, decrypt]);

  /** Save all items — builds both index and items files, encrypts, PUTs both. */
  const save = useCallback(async (items: VaultItem[]): Promise<VaultItem[]> => {
    if (!token || !vaultId) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const withWarnings = await computeWarnings(items);
      const indexFile = buildIndexFile(withWarnings);
      const itemsFile = buildItemsFile(withWarnings);

      const [encryptedIndex, encryptedItems] = await Promise.all([
        encrypt(vaultId, JSON.stringify(indexFile)),
        encrypt(vaultId, JSON.stringify(itemsFile)),
      ]);

      const res = await api.putVault(vaultId, { encryptedIndex, encryptedItems }, token);
      setLastModified(res.lastModified);
      setRawEncryptedItems(encryptedItems);

      // Update in-memory cache
      const record: Record<string, VaultItem> = {};
      for (const item of withWarnings) record[item.id] = item;
      itemsCacheRef.current = record;

      return withWarnings;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save vault';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [vaultId, token, encrypt]);

  const addItem = useCallback(async (currentItems: VaultItem[], item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt' | 'warningCodes'>): Promise<VaultItem[]> => {
    const now = new Date().toISOString();
    const newItem = { ...item, id: randomUUID(), createdAt: now, updatedAt: now, warningCodes: [] } as unknown as VaultItem;
    return save([...currentItems, newItem]);
  }, [save]);

  const updateItem = useCallback(async (currentItems: VaultItem[], updated: VaultItem): Promise<VaultItem[]> => {
    const now = new Date().toISOString();
    const items = currentItems.map(item =>
      item.id === updated.id ? { ...updated, updatedAt: now } : item,
    );
    return save(items);
  }, [save]);

  const deleteItem = useCallback(async (currentItems: VaultItem[], itemId: string): Promise<VaultItem[]> => {
    return save(currentItems.filter(item => item.id !== itemId));
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

  /** Clear the in-memory items cache (call when locking vault). */
  const clearItemsCache = useCallback(() => {
    itemsCacheRef.current = null;
    setRawEncryptedItems(null);
  }, []);

  return {
    loading,
    error,
    lastModified,
    rawEncryptedItems,
    fetchIndex,
    fetchItem,
    fetchAllItems,
    save,
    addItem,
    updateItem,
    deleteItem,
    download,
    sendEmail,
    clearItemsCache,
  };
}
