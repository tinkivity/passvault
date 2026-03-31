import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';
import type { VaultSummary, WarningCodeDefinition } from '@passvault/shared';
import { useAuth } from '../../hooks/useAuth.js';
import { useAutoLogout } from '../../hooks/useAutoLogout.js';
import { useVaults } from '../../hooks/useVaults.js';
import { useWarningCatalog } from '../../hooks/useWarningCatalog.js';
import { useAuthContext } from '../../context/AuthContext.js';
import { useEncryptionContext } from '../../context/EncryptionContext.js';
import { EnvironmentBanner } from '../layout/EnvironmentBanner.js';
import { VaultSidebar } from './VaultSidebar.js';
import { VaultBreadcrumbs } from './VaultBreadcrumbs.js';
import { ShellHeader } from '../shared/ShellHeader.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';

const VIEW_TIMEOUT = Number(import.meta.env.VITE_VIEW_TIMEOUT_SECONDS ?? 900);

export interface VaultShellContext {
  vaults: VaultSummary[];
  catalog: WarningCodeDefinition[];
  refreshVaults: () => Promise<void>;
}

import { createContext, useContext } from 'react';

const ShellContext = createContext<VaultShellContext | null>(null);

export function useVaultShellContext(): VaultShellContext {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useVaultShellContext must be used within VaultShell');
  return ctx;
}

export function VaultShell() {
  const navigate = useNavigate();
  const { vaultId } = useParams<{ vaultId: string }>();
  const { token, plan, logout } = useAuth();
  const { encryptionSalt } = useAuthContext();
  const { deriveKey, hasKey } = useEncryptionContext();
  const { fetchVaults, createVault } = useVaults(token);
  const { catalog, fetchCatalog } = useWarningCatalog();

  const [locked, setLocked] = useState(!hasKey());
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockLoading, setUnlockLoading] = useState(false);

  const [vaults, setVaults] = useState<VaultSummary[]>([]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const { secondsLeft } = useAutoLogout({
    timeoutSeconds: VIEW_TIMEOUT,
    onLogout: handleLogout,
    active: true,
  });

  const refreshVaults = useCallback(async () => {
    const list = await fetchVaults();
    setVaults(list);
    // Redirect to first vault if none selected
    if (!vaultId && list.length > 0) {
      navigate(`/vault/${list[0].vaultId}/items`, { replace: true });
    }
  }, [fetchVaults, vaultId, navigate]);

  useEffect(() => {
    refreshVaults();
    fetchCatalog();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRenameVault = useCallback(async (vaultId: string, displayName: string) => {
    const updated = await api.renameVault(vaultId, { displayName }, token!);
    setVaults(prev => prev.map(v => v.vaultId === vaultId ? { ...v, displayName: updated.displayName } : v));
  }, [token]);

  const handleDownloadVault = useCallback(async (vaultId: string, displayName: string) => {
    const res = await api.downloadVault(vaultId, token!);
    const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = displayName.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `passvault-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [token]);

  const handleEmailVault = useCallback(async (vaultId: string) => {
    await api.sendVaultEmail(vaultId, token!);
  }, [token]);

  const handleCreateVault = useCallback(async (displayName: string) => {
    const newVault = await createVault(displayName);
    const updated = [...vaults, newVault];
    setVaults(updated);
    navigate(`/vault/${newVault.vaultId}/items`);
  }, [createVault, vaults, navigate]);

  const handleUnlock = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encryptionSalt) return;
    setUnlockLoading(true);
    setUnlockError(null);
    try {
      await deriveKey(unlockPassword, encryptionSalt);
      setLocked(false);
      setUnlockPassword('');
    } catch {
      setUnlockError('Incorrect password. Please try again.');
    } finally {
      setUnlockLoading(false);
    }
  }, [deriveKey, unlockPassword, encryptionSalt]);

  if (locked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="w-full max-w-sm rounded-lg border border-border bg-background p-8 space-y-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <LockClosedIcon className="h-8 w-8 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Vault locked</h1>
            <p className="text-sm text-muted-foreground">
              Enter your password to unlock your vault.
            </p>
          </div>
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="unlock-password">Password</Label>
              <Input
                id="unlock-password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={unlockPassword}
                onChange={e => setUnlockPassword(e.target.value)}
                required
              />
            </div>
            {unlockError && <p className="text-sm text-destructive">{unlockError}</p>}
            <Button type="submit" className="w-full" disabled={unlockLoading}>
              {unlockLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Unlocking…</> : 'Unlock'}
            </Button>
          </form>
          <div className="text-center">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => { logout(); navigate('/login', { replace: true }); }}
            >
              Sign out instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  const shellContext: VaultShellContext = { vaults, catalog, refreshVaults };

  return (
    <ShellContext.Provider value={shellContext}>
      <SidebarProvider>
        <div className="flex h-screen flex-col w-full">
          <EnvironmentBanner />
          <div className="flex flex-1 overflow-hidden">
            <VaultSidebar
              vaults={vaults}
              plan={plan ?? 'free'}
              onLogout={handleLogout}
              onCreateVault={handleCreateVault}
              onRenameVault={handleRenameVault}
              onDownloadVault={handleDownloadVault}
              onEmailVault={handleEmailVault}
            />
            <SidebarInset className="flex flex-col overflow-hidden">
              <ShellHeader breadcrumbs={<VaultBreadcrumbs />} secondsLeft={secondsLeft} />
              <main className="flex-1 overflow-auto bg-muted p-6">
                <Outlet />
              </main>
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    </ShellContext.Provider>
  );
}
