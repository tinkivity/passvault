import { createContext, useContext } from 'react';
import type { VaultSummary, WarningCodeDefinition } from '@passvault/shared';

export interface VaultShellContext {
  vaults: VaultSummary[];
  catalog: WarningCodeDefinition[];
  refreshVaults: () => Promise<void>;
}

export const ShellContext = createContext<VaultShellContext | null>(null);

export function useVaultShellContext(): VaultShellContext {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useVaultShellContext must be used within VaultShell');
  return ctx;
}
