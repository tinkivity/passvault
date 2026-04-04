import { useState, useCallback, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Vault, Plus, MoreHorizontal, Download, Upload, Mail, Pencil, Lock, LayoutDashboard, Users, ScrollText, UserPlus, Trash2 } from 'lucide-react';
import type { VaultDownloadResponse } from '@passvault/shared';
import { ImportVaultDialog } from './ImportVaultDialog.js';
import type { VaultSummary } from '@passvault/shared';
import { LIMITS } from '@passvault/shared';
import logo from '../../assets/logo.png';
import { NavUser } from '../shared/NavUser.js';
import { useEncryptionContext } from '../../context/EncryptionContext.js';
import { useVaultTimeout } from '../../hooks/useVaultTimeout.js';
import { config } from '../../config.js';
import { ROUTES } from '../../routes.js';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const isProd = config.isProd;
const VAULT_TIMEOUT = config.timeouts.vaultTimeout;

/* -------------------------------------------------------------------------- */
/*  VaultTimeoutRing — circular progress for vault lock countdown             */
/* -------------------------------------------------------------------------- */

interface VaultTimeoutRingProps {
  vaultId: string;
  unlocked: boolean;
  onTimeout: (vaultId: string) => void;
  resetCounter?: number;
}

function VaultTimeoutRing({ vaultId, unlocked, onTimeout, resetCounter = 0 }: VaultTimeoutRingProps) {
  const handleTimeout = useCallback(() => {
    onTimeout(vaultId);
  }, [onTimeout, vaultId]);

  const { secondsLeft, reset } = useVaultTimeout({
    timeoutSeconds: VAULT_TIMEOUT,
    onTimeout: handleTimeout,
    active: unlocked,
  });

  // Reset the timer when the external counter changes (item CRUD)
  const prevCounterRef = useRef(resetCounter);
  useEffect(() => {
    if (resetCounter !== prevCounterRef.current) {
      prevCounterRef.current = resetCounter;
      reset();
    }
  }, [resetCounter, reset]);

  if (!unlocked) return null;

  const fraction = secondsLeft / VAULT_TIMEOUT;
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fraction);

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className="shrink-0"
      aria-label={`Vault timeout: ${secondsLeft}s remaining`}
    >
      {/* Background ring */}
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-muted-foreground/20"
      />
      {/* Progress ring */}
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        className={fraction <= 0.25 ? 'text-destructive' : fraction <= 0.5 ? 'text-amber-500' : 'text-primary'}
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  VaultSidebar                                                              */
/* -------------------------------------------------------------------------- */

interface VaultSidebarProps {
  vaults: VaultSummary[];
  plan: string;
  role: 'user' | 'admin';
  onLogout: () => void;
  onCreateVault: (displayName: string, password: string) => Promise<void>;
  onRenameVault: (vaultId: string, displayName: string) => Promise<void>;
  onDownloadVault: (vaultId: string, displayName: string) => Promise<void>;
  onEmailVault: (vaultId: string) => Promise<void>;
  onImportVault: (displayName: string, fileData: VaultDownloadResponse, password: string) => Promise<void>;
  onDeleteVault?: (vaultId: string) => Promise<void>;
  vaultResetCounters?: Map<string, number>;
}

export function VaultSidebar({ vaults, plan, role, onLogout, onCreateVault, onRenameVault, onDownloadVault, onEmailVault, onImportVault, onDeleteVault, vaultResetCounters }: VaultSidebarProps) {
  const navigate = useNavigate();
  const { vaultId } = useParams<{ vaultId: string }>();
  const { hasKey, clearKey } = useEncryptionContext();
  const { t } = useTranslation('vault');
  const [emailedVaultId, setEmailedVaultId] = useState<string | null>(null);
  const [renamingVault, setRenamingVault] = useState<VaultSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const handleVaultTimeout = useCallback((vid: string) => {
    clearKey(vid);
    navigate(ROUTES.UI.VAULT(vid));
  }, [clearKey, navigate]);

  const handleEmail = async (id: string) => {
    await onEmailVault(id);
    setEmailedVaultId(id);
    setTimeout(() => setEmailedVaultId(null), 4000);
  };

  const openRename = (vault: VaultSummary) => {
    setRenamingVault(vault);
    setRenameValue(vault.displayName);
    setRenameError(null);
  };

  const handleRename = async () => {
    if (!renamingVault || !renameValue.trim()) return;
    setRenaming(true);
    setRenameError(null);
    try {
      await onRenameVault(renamingVault.vaultId, renameValue.trim());
      setRenamingVault(null);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : t('failedToRename'));
    } finally {
      setRenaming(false);
    }
  };

  const [deletingVault, setDeletingVault] = useState<VaultSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteVault = async () => {
    if (!deletingVault || !onDeleteVault) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      clearKey(deletingVault.vaultId);
      await onDeleteVault(deletingVault.vaultId);
      setDeletingVault(null);
      navigate(ROUTES.UI.ROOT);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete vault';
      if (msg.toLowerCase().includes('last vault') || msg.toLowerCase().includes('cannot delete')) {
        setDeleteError('Cannot delete your last vault.');
      } else {
        setDeleteError(msg);
      }
    } finally {
      setDeleting(false);
    }
  };

  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirm, setNewConfirm] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const planLimit = LIMITS.VAULT_LIMITS[plan] ?? 1;
  const canCreate = vaults.length < planLimit;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    if (!newPassword) { setCreateError(t('passwordIsRequired')); return; }
    if (newPassword !== newConfirm) { setCreateError(t('passwordsDoNotMatch')); return; }
    setCreating(true);
    setCreateError(null);
    try {
      await onCreateVault(newName.trim(), newPassword);
      setShowDialog(false);
      setNewName('');
      setNewPassword('');
      setNewConfirm('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t('failedToCreate'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex h-14 items-center gap-2 px-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <img src={logo} alt="" className="h-6 w-6 shrink-0" />
            <span className="font-bold text-sm truncate group-data-[collapsible=icon]:hidden">PassVault</span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t('common:vaults')}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {vaults.map(vault => {
                  const unlocked = hasKey(vault.vaultId);
                  const vaultTo = unlocked ? `/ui/${vault.vaultId}/items` : `/ui/${vault.vaultId}`;
                  return (
                    <SidebarMenuItem key={vault.vaultId}>
                      <SidebarMenuButton
                        render={<NavLink to={vaultTo} />}
                        isActive={vaultId === vault.vaultId}
                        tooltip={vault.displayName}
                      >
                        <Vault className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{vault.displayName}</span>
                        <VaultTimeoutRing
                          vaultId={vault.vaultId}
                          unlocked={unlocked}
                          onTimeout={handleVaultTimeout}
                          resetCounter={vaultResetCounters?.get(vault.vaultId) ?? 0}
                        />
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<SidebarMenuAction showOnHover />}>
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">{t('vaultActions')}</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                          {unlocked ? (
                            <>
                              <DropdownMenuItem onClick={() => { clearKey(vault.vaultId); navigate(ROUTES.UI.VAULT(vault.vaultId)); }}>
                                <Lock className="mr-2 h-4 w-4" />
                                {t('closeVault')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openRename(vault)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                {t('renameVault')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDownloadVault(vault.vaultId, vault.displayName)}>
                                <Download className="mr-2 h-4 w-4" />
                                {t('downloadVault')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => navigate(ROUTES.UI.ITEM_NEW(vault.vaultId))}>
                                <Plus className="mr-2 h-4 w-4" />
                                {t('newItem')}
                              </DropdownMenuItem>
                              {isProd && (
                                <DropdownMenuItem onClick={() => handleEmail(vault.vaultId)}>
                                  <Mail className="mr-2 h-4 w-4" />
                                  {emailedVaultId === vault.vaultId ? t('emailSent') : t('emailVault')}
                                </DropdownMenuItem>
                              )}
                              {onDeleteVault && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => { setDeletingVault(vault); setDeleteError(null); }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {t('deleteVault')}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={() => navigate(ROUTES.UI.VAULT(vault.vaultId))}>
                                <Vault className="mr-2 h-4 w-4" />
                                {t('openVault')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openRename(vault)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                {t('renameVault')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDownloadVault(vault.vaultId, vault.displayName)}>
                                <Download className="mr-2 h-4 w-4" />
                                {t('downloadVault')}
                              </DropdownMenuItem>
                              {onDeleteVault && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => { setDeletingVault(vault); setDeleteError(null); }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {t('deleteVault')}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  );
                })}
                {canCreate && (
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setShowDialog(true)} tooltip={t('newVault')}>
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>{t('newVault')}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canCreate && plan !== 'free' && (
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setShowImportDialog(true)} tooltip={t('importVault')}>
                      <Upload className="h-4 w-4 shrink-0" />
                      <span>{t('importVault')}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {role === 'admin' && (
            <SidebarGroup>
              <SidebarGroupLabel>{t('common:administration')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton render={<NavLink to={ROUTES.UI.ADMIN.DASHBOARD} />} tooltip={t('common:dashboard')}>
                      <LayoutDashboard className="h-4 w-4 shrink-0" />
                      <span>{t('common:dashboard')}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton render={<NavLink to={ROUTES.UI.ADMIN.USERS} />} tooltip={t('common:users')}>
                      <Users className="h-4 w-4 shrink-0" />
                      <span>{t('common:users')}</span>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<SidebarMenuAction showOnHover />}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start">
                        <DropdownMenuItem onClick={() => navigate(`${ROUTES.UI.ADMIN.USERS}?create=1`)}>
                          <UserPlus className="mr-2 h-4 w-4" />
                          {t('createUser')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton render={<NavLink to={ROUTES.UI.ADMIN.AUDIT} />} tooltip={t('common:auditLog')}>
                      <ScrollText className="h-4 w-4 shrink-0" />
                      <span>{t('common:auditLog')}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border">
          <NavUser onLogout={onLogout} />
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <Dialog open={!!renamingVault} onOpenChange={open => { if (!open) setRenamingVault(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('renameVault')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="rename-vault-name">{t('common:name')}</Label>
              <Input
                id="rename-vault-name"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRename()}
                maxLength={64}
                autoFocus
              />
            </div>
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingVault(null)}>{t('common:cancel')}</Button>
            <Button onClick={handleRename} disabled={renaming || !renameValue.trim()}>
              {renaming ? t('common:saving') : t('common:save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) { setNewName(''); setNewPassword(''); setNewConfirm(''); setCreateError(null); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('newVault')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="vault-name">{t('common:name')}</Label>
              <Input
                id="vault-name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="My Vault"
                maxLength={64}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vault-password">{t('common:password')}</Label>
              <Input
                id="vault-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vault-confirm">{t('confirmVaultPassword')}</Label>
              <Input
                id="vault-confirm"
                type="password"
                autoComplete="new-password"
                value={newConfirm}
                onChange={e => setNewConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{t('common:cancel')}</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim() || !newPassword}>
              {creating ? t('common:creating') : t('common:create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingVault} onOpenChange={open => { if (!open) { setDeletingVault(null); setDeleteError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteVault')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {t('deleteVaultConfirm', { name: deletingVault?.displayName })}
            </p>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeletingVault(null); setDeleteError(null); }}>{t('common:cancel')}</Button>
            <Button variant="destructive" onClick={handleDeleteVault} disabled={deleting}>
              {deleting ? t('common:deleting') : t('deleteVault')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportVaultDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={onImportVault}
      />
    </>
  );
}
