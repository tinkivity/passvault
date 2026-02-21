import { useEncryptionContext } from '../context/EncryptionContext.js';

export function useEncryption() {
  return useEncryptionContext();
}
