import React, { createContext, useContext, useCallback } from 'react';
import { deriveKey, encrypt, decrypt, clearKey, hasKey } from '../services/crypto.js';

interface EncryptionContextValue {
  deriveKey: (password: string, salt: string) => Promise<void>;
  encrypt: (plaintext: string) => Promise<string>;
  decrypt: (ciphertext: string) => Promise<string>;
  clearKey: () => void;
  hasKey: () => boolean;
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null);

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const derive = useCallback(
    (password: string, salt: string) => deriveKey(password, salt),
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
