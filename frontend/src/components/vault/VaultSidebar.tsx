import { useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { Vault, Plus, MoreHorizontal, Download, Mail, Pencil, Lock, LayoutDashboard, Users, ScrollText } from 'lucide-react';
import type { VaultSummary } from '@passvault/shared';
import { LIMITS } from '@passvault/shared';
import logo from '../../assets/logo.png';
import { NavUser } from '../shared/NavUser.js';
import { useEncryptionContext } from '../../context/EncryptionContext.js';
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

const isProd = import.meta.env.VITE_ENVIRONMENT === 'prod';

interface VaultSidebarProps {
  vaults: VaultSummary[];
  plan: string;
  role: 'user' | 'admin';
  onLogout: () => void;
  onCreateVault: (displayName: string) => Promise<void>;
  onRenameVault: (vaultId: string, displayName: string) => Promise<void>;
  onDownloadVault: (vaultId: string, displayName: string) => Promise<void>;
  onEmailVault: (vaultId: string) => Promise<void>;
}

export function VaultSidebar({ vaults, plan, role, onLogout, onCreateVault, onRenameVault, onDownloadVault, onEmailVault }: VaultSidebarProps) {
  const navigate = useNavigate();
  const { vaultId } = useParams<{ vaultId: string }>();
  const { hasKey, clearKey } = useEncryptionContext();
  const [emailedVaultId, setEmailedVaultId] = useState<string | null>(null);
  const [renamingVault, setRenamingVault] = useState<VaultSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

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
      setRenameError(err instanceof Error ? err.message : 'Failed to rename vault');
    } finally {
      setRenaming(false);
    }
  };

  const [showDialog, setShowDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const planLimit = LIMITS.VAULT_LIMITS[plan] ?? 1;
  const canCreate = vaults.length < planLimit;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await onCreateVault(newName.trim());
      setShowDialog(false);
      setNewName('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create vault');
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
            <SidebarGroupLabel>Vaults</SidebarGroupLabel>
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
                        <span>{vault.displayName}</span>
                      </SidebarMenuButton>
                      {unlocked && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<SidebarMenuAction showOnHover />}>
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Vault actions</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="right" align="start">
                            <DropdownMenuItem onClick={() => navigate(`/ui/${vault.vaultId}/items/new`)}>
                              <Plus className="mr-2 h-4 w-4" />
                              New item
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openRename(vault)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Rename vault
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { clearKey(vault.vaultId); navigate(`/ui/${vault.vaultId}`); }}>
                              <Lock className="mr-2 h-4 w-4" />
                              Close vault
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onDownloadVault(vault.vaultId, vault.displayName)}>
                              <Download className="mr-2 h-4 w-4" />
                              Download vault
                            </DropdownMenuItem>
                            {isProd && (
                              <DropdownMenuItem onClick={() => handleEmail(vault.vaultId)}>
                                <Mail className="mr-2 h-4 w-4" />
                                {emailedVaultId === vault.vaultId ? 'Email sent!' : 'Email vault'}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </SidebarMenuItem>
                  );
                })}
                {canCreate && (
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setShowDialog(true)} tooltip="New Vault">
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>New Vault</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {role === 'admin' && (
            <SidebarGroup>
              <SidebarGroupLabel>Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton render={<NavLink to="/ui/admin/dashboard" />} tooltip="Dashboard">
                      <LayoutDashboard className="h-4 w-4 shrink-0" />
                      <span>Dashboard</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton render={<NavLink to="/ui/admin/users" />} tooltip="Users">
                      <Users className="h-4 w-4 shrink-0" />
                      <span>Users</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton render={<NavLink to="/ui/admin/logs/logins" />} tooltip="Logins">
                      <ScrollText className="h-4 w-4 shrink-0" />
                      <span>Logins</span>
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
            <DialogTitle>Rename Vault</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="rename-vault-name">Name</Label>
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
            <Button variant="outline" onClick={() => setRenamingVault(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={renaming || !renameValue.trim()}>
              {renaming ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Vault</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="vault-name">Name</Label>
              <Input
                id="vault-name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="My Vault"
                maxLength={64}
                autoFocus
              />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
