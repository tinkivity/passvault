import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api.js';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { VaultSummary, VaultDownloadResponse } from '@passvault/shared';
import { useAuth } from '../../hooks/useAuth.js';
import { useEncryptionContext } from '../../context/EncryptionContext.js';
import { deriveKey as deriveCryptoKey, decrypt as decryptContent, encrypt as encryptContent, clearKey as clearCryptoKey } from '../../services/crypto.js';
import { useAutoLogout } from '../../hooks/useAutoLogout.js';
import { useVaults } from '../../hooks/useVaults.js';
import { useWarningCatalog } from '../../hooks/useWarningCatalog.js';
import { EnvironmentBanner } from '../layout/EnvironmentBanner.js';
import { VaultSidebar } from './VaultSidebar.js';
import { VaultBreadcrumbs } from './VaultBreadcrumbs.js';
import { AdminBreadcrumbs } from '../admin/AdminBreadcrumbs.js';
import { ShellHeader } from '../shared/ShellHeader.js';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { config } from '../../config.js';
import { ROUTES } from '../../routes.js';
import { ShellContext } from '../../context/VaultShellContext.js';

export type { VaultShellContext } from '../../context/VaultShellContext.js';
export { useVaultShellContext } from '../../context/VaultShellContext.js';

const SESSION_TIMEOUT = config.timeouts.session;

export function VaultShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { vaultId } = useParams<{ vaultId: string }>();
  const { token, role, plan, accountExpired, logout } = useAuth();
  const [expiredDismissed, setExpiredDismissed] = useState(false);
  const { deriveKey } = useEncryptionContext();
  const { fetchVaults, createVault, deleteVault } = useVaults(token);
  const { catalog, fetchCatalog } = useWarningCatalog();

  const [vaults, setVaults] = useState<VaultSummary[]>([]);
  const [showExtendModal, setShowExtendModal] = useState(false);

  const handleLogout = useCallback(() => {
    logout();
    navigate(ROUTES.LOGIN, { replace: true });
  }, [logout, navigate]);

  const { secondsLeft, extend } = useAutoLogout({
    timeoutSeconds: SESSION_TIMEOUT,
    onLogout: handleLogout,
    active: true,
  });

  // Show extend-session modal when less than 10 seconds remain
  useEffect(() => {
    if (secondsLeft > 0 && secondsLeft < 10) {
      setShowExtendModal(true);
    }
  }, [secondsLeft]);

  const handleExtendSession = useCallback(() => {
    extend();
    setShowExtendModal(false);
  }, [extend]);

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

  const handleImportVault = useCallback(async (displayName: string, fileData: VaultDownloadResponse, password: string) => {
    // deriveCryptoKey, decryptContent, encryptContent, clearCryptoKey imported statically at top
    const tempId = `__import_${Date.now()}`;
    try {
      // Decrypt both files with original salt
      await deriveCryptoKey(tempId, password, fileData.encryptionSalt);
      const indexPlaintext = await decryptContent(tempId, fileData.encryptedIndex);
      const itemsPlaintext = await decryptContent(tempId, fileData.encryptedItems);
      clearCryptoKey(tempId);

      // Create new vault (flagged as import for audit trail)
      const newVault = await createVault(displayName, 'import');
      setVaults(prev => [...prev, newVault]);

      // Re-encrypt both files with the new vault's salt
      await deriveCryptoKey(newVault.vaultId, password, newVault.encryptionSalt);
      const [encryptedIndex, encryptedItems] = await Promise.all([
        encryptContent(newVault.vaultId, indexPlaintext),
        encryptContent(newVault.vaultId, itemsPlaintext),
      ]);

      // Save the data
      await api.putVault(newVault.vaultId, { encryptedIndex, encryptedItems }, token!);

      // Key is already derived for the new vault — navigate directly to items
      navigate(ROUTES.UI.ITEMS(newVault.vaultId));
    } catch (err) {
      clearCryptoKey(tempId);
      throw err;
    }
  }, [createVault, token, navigate]);

  // Vault timeout reset mechanism: bump a counter per vault to signal VaultTimeoutRing
  const vaultResetCountersRef = useRef(new Map<string, number>());
  const [vaultResetCounters, setVaultResetCounters] = useState(new Map<string, number>());

  const resetVaultTimeout = useCallback((vid: string) => {
    vaultResetCountersRef.current.set(vid, (vaultResetCountersRef.current.get(vid) ?? 0) + 1);
    setVaultResetCounters(new Map(vaultResetCountersRef.current));
  }, []);

  const handleDeleteVault = useCallback(async (vaultId: string) => {
    await deleteVault(vaultId);
    setVaults(prev => prev.filter(v => v.vaultId !== vaultId));
  }, [deleteVault]);

  // Reset vault timeout on every route change within a vault
  useEffect(() => {
    if (vaultId) resetVaultTimeout(vaultId);
  }, [pathname, vaultId, resetVaultTimeout]);

  const isAdminRoute = pathname.startsWith(ROUTES.UI.ADMIN.ROOT);
  const shellContext = { vaults, catalog, refreshVaults, resetVaultTimeout };

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
              onImportVault={handleImportVault}
              onDeleteVault={handleDeleteVault}
              vaultResetCounters={vaultResetCounters}
            />
            <SidebarInset className="flex flex-col overflow-hidden">
              <ShellHeader
                breadcrumbs={isAdminRoute ? <AdminBreadcrumbs /> : <VaultBreadcrumbs />}
                secondsLeft={secondsLeft}
                onExtend={handleExtendSession}
                onLogout={handleLogout}
              />
              <main className="flex-1 overflow-auto bg-muted p-6">
                {!isAdminRoute && vaults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <h2 className="text-lg font-semibold mb-2">{t('vault:noVaultsYet')}</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('vault:createFirstVault')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('vault:useSidebarToCreate')}
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

      <Dialog open={accountExpired && !expiredDismissed} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('accountExpiredTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('accountExpiredMessage')}
          </p>
          <DialogFooter>
            <Button onClick={() => setExpiredDismissed(true)}>{t('ok')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend-session modal */}
      <Dialog open={showExtendModal} onOpenChange={setShowExtendModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sessionExpiring')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {t('sessionExpiringMessage', { seconds: secondsLeft })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={handleLogout}>{t('logOut')}</Button>
            <Button onClick={handleExtendSession}>{t('extendSession')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ShellContext.Provider>
  );
}
