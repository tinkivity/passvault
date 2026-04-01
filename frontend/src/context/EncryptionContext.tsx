import React, { createContext, useContext, useCallback } from 'react';
import { deriveKey, encrypt, decrypt, clearKey, hasKey } from '../services/crypto.js';

interface EncryptionContextValue {
  deriveKey: (vaultId: string, password: string, salt: string) => Promise<void>;
  encrypt: (vaultId: string, plaintext: string) => Promise<string>;
  decrypt: (vaultId: string, ciphertext: string) => Promise<string>;
  clearKey: (vaultId?: string) => void;
  hasKey: (vaultId: string) => boolean;
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null);

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const derive = useCallback(
    (vaultId: string, password: string, salt: string) => deriveKey(vaultId, password, salt),
    [],
  );

  const value: EncryptionContextValue = {
    deriveKey: derive,
    encrypt,
    decrypt,
    clearKey,
    hasKey,
  };

  return (
    <EncryptionContext.Provider value={value}>
      {children}
    </EncryptionContext.Provider>
  );
}

export function useEncryptionContext(): EncryptionContextValue {
  const ctx = useContext(EncryptionContext);
  if (!ctx) throw new Error('useEncryptionContext must be used within EncryptionProvider');
  return ctx;
}
