import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { VaultSummary } from '@passvault/shared';
import { useAuth } from '../../hooks/useAuth.js';
import { useEncryptionContext } from '../../context/EncryptionContext.js';
import { useAutoLogout } from '../../hooks/useAutoLogout.js';
import { useVaults } from '../../hooks/useVaults.js';
import { useWarningCatalog } from '../../hooks/useWarningCatalog.js';
import { EnvironmentBanner } from '../layout/EnvironmentBanner.js';
import { VaultSidebar } from './VaultSidebar.js';
import { VaultBreadcrumbs } from './VaultBreadcrumbs.js';
import { AdminBreadcrumbs } from '../admin/AdminBreadcrumbs.js';
import { ShellHeader } from '../shared/ShellHeader.js';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { config } from '../../config.js';
import { ROUTES } from '../../routes.js';
import { ShellContext } from '../../context/VaultShellContext.js';

export type { VaultShellContext } from '../../context/VaultShellContext.js';
export { useVaultShellContext } from '../../context/VaultShellContext.js';

const VIEW_TIMEOUT = config.timeouts.view;
const ADMIN_TIMEOUT = config.timeouts.admin;

export function VaultShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { vaultId } = useParams<{ vaultId: string }>();
  const { token, role, plan, logout } = useAuth();
  const { deriveKey } = useEncryptionContext();
  const { fetchVaults, createVault } = useVaults(token);
  const { catalog, fetchCatalog } = useWarningCatalog();

  const [vaults, setVaults] = useState<VaultSummary[]>([]);

  const handleLogout = useCallback(() => {
    logout();
    navigate(ROUTES.LOGIN, { replace: true });
  }, [logout, navigate]);

  const timeoutSeconds = role === 'admin' ? ADMIN_TIMEOUT : VIEW_TIMEOUT;

  const { secondsLeft } = useAutoLogout({
    timeoutSeconds,
    onLogout: handleLogout,
    active: true,
  });

  const refreshVaults = useCallback(async () => {
    const list = await fetchVaults();
    setVaults(list);
  }, [fetchVaults]);

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

  const handleCreateVault = useCallback(async (displayName: string, password: string) => {
    const newVault = await createVault(displayName);
    setVaults(prev => [...prev, newVault]);
    await deriveKey(newVault.vaultId, password, newVault.encryptionSalt);
    navigate(ROUTES.UI.ITEMS(newVault.vaultId));
  }, [createVault, deriveKey, navigate]);

  const isAdminRoute = pathname.startsWith(ROUTES.UI.ADMIN.ROOT);
  const shellContext = { vaults, catalog, refreshVaults };

  return (
    <ShellContext.Provider value={shellContext}>
      <SidebarProvider>
        <div className="flex h-screen flex-col w-full">
          <EnvironmentBanner />
          <div className="flex flex-1 overflow-hidden">
            <VaultSidebar
              vaults={vaults}
              plan={plan ?? 'free'}
              role={role ?? 'user'}
              onLogout={handleLogout}
              onCreateVault={handleCreateVault}
              onRenameVault={handleRenameVault}
              onDownloadVault={handleDownloadVault}
              onEmailVault={handleEmailVault}
            />
            <SidebarInset className="flex flex-col overflow-hidden">
              <ShellHeader
                breadcrumbs={isAdminRoute ? <AdminBreadcrumbs /> : <VaultBreadcrumbs />}
                secondsLeft={secondsLeft}
              />
              <main className="flex-1 overflow-auto bg-muted p-6">
                {!isAdminRoute && vaults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <h2 className="text-lg font-semibold mb-2">No vaults yet</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create your first vault to start storing passwords securely.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Use the sidebar to create a new vault.
                    </p>
                  </div>
                ) : (
                  <Outlet />
                )}
              </main>
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    </ShellContext.Provider>
  );
}
