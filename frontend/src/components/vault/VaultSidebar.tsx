import { useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { Vault, Plus, LogOut } from 'lucide-react';
import type { VaultSummary } from '@passvault/shared';
import { LIMITS } from '@passvault/shared';
import logo from '../../assets/logo.png';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
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

interface VaultSidebarProps {
  vaults: VaultSummary[];
  plan: string;
  username: string;
  onLogout: () => void;
  onCreateVault: (displayName: string) => Promise<void>;
}

export function VaultSidebar({ vaults, plan, username, onLogout, onCreateVault }: VaultSidebarProps) {
  const { vaultId } = useParams<{ vaultId: string }>();
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
                {vaults.map(vault => (
                  <SidebarMenuItem key={vault.vaultId}>
                    <SidebarMenuButton
                      render={<NavLink to={`/vault/${vault.vaultId}/items`} />}
                      isActive={vaultId === vault.vaultId}
                      tooltip={vault.displayName}
                    >
                      <Vault className="h-4 w-4 shrink-0" />
                      <span>{vault.displayName}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border">
          <div className="px-3 py-1 text-xs text-sidebar-foreground/60 truncate group-data-[collapsible=icon]:hidden">
            {username}
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onLogout} tooltip="Logout">
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

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
