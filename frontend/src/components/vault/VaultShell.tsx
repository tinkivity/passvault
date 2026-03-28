import { useCallback, useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { SunIcon, MoonIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';
import type { VaultSummary, WarningCodeDefinition } from '@passvault/shared';
import { useAuth } from '../../hooks/useAuth.js';
import { useAutoLogout } from '../../hooks/useAutoLogout.js';
import { useTheme } from '../../hooks/useTheme.js';
import { useVaults } from '../../hooks/useVaults.js';
import { useWarningCatalog } from '../../hooks/useWarningCatalog.js';
import { useAuthContext } from '../../context/AuthContext.js';
import { useEncryptionContext } from '../../context/EncryptionContext.js';
import { EnvironmentBanner } from '../layout/EnvironmentBanner.js';
import { VaultSidebar } from './VaultSidebar.js';
import { VaultBreadcrumbs } from './VaultBreadcrumbs.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';

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
  const { token, username, plan, logout } = useAuth();
  const { encryptionSalt } = useAuthContext();
  const { deriveKey, hasKey } = useEncryptionContext();
  const { isDark, toggleTheme } = useTheme();
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

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const timeDisplay = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

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
              username={username ?? ''}
              onLogout={handleLogout}
              onCreateVault={handleCreateVault}
            />
            <SidebarInset className="flex flex-col overflow-hidden">
              <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <div className="flex-1 min-w-0">
                  <VaultBreadcrumbs />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm text-foreground/60 hidden sm:inline mr-2">{timeDisplay}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={toggleTheme}
                    title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                    aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {isDark
                      ? <SunIcon className="w-4 h-4" />
                      : <MoonIcon className="w-4 h-4" />}
                  </Button>
                </div>
              </header>
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
