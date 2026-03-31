import { useState } from 'react';
import { ChevronsUpDown, LogOut, BadgeCheck, Bell, Sparkles, KeyRound } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { AccountDialog } from './AccountDialog.js';
import { NotificationsDialog } from './NotificationsDialog.js';
import { validatePassword } from '@passvault/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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

interface NavUserProps {
  role: 'user' | 'admin';
  onLogout: () => void;
}

export function NavUser({ role, onLogout }: NavUserProps) {
  const { username, firstName, displayName, plan, adminChangePassword, loading } = useAuth();
  const { isMobile } = useSidebar();

  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const handlePwSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);

    if (newPassword !== confirm) {
      setPwError('Passwords do not match');
      return;
    }
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      setPwError(validation.errors.join(', '));
      return;
    }
    try {
      await adminChangePassword({ newPassword });
      setPwSuccess(true);
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  const label = displayName ?? firstName ?? username ?? '';
  const initials = label[0]?.toUpperCase() ?? '?';
  const planLabel = plan === 'pro' ? 'Pro Plan' : 'Free Plan';

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold">{label}</span>
                    <span className="truncate text-xs">{planLabel}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              }
            />
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              side={isMobile ? 'bottom' : 'right'}
              align="end"
              sideOffset={4}
            >
              {/* Header */}
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{label}</span>
                      <span className="truncate text-xs">{username}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />

              {/* User-only: Upgrade to Pro */}
              {role === 'user' && plan !== 'pro' && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Upgrade to Pro
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Account (both) + Notifications (user only) */}
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setAccountOpen(true)}>
                  <BadgeCheck className="mr-2 h-4 w-4" />
                  Account
                </DropdownMenuItem>
                {role === 'user' && (
                  <DropdownMenuItem onClick={() => setNotifOpen(true)}>
                    <Bell className="mr-2 h-4 w-4" />
                    Notifications
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />

              {/* Admin-only: Change Password */}
              {role === 'admin' && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => { setPwOpen(true); setPwSuccess(false); setPwError(null); }}>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Change Password
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuItem onClick={onLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* Account dialog (both roles) */}
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />

      {/* Notifications dialog (user only) */}
      {role === 'user' && (
        <NotificationsDialog open={notifOpen} onOpenChange={setNotifOpen} />
      )}

      {/* Change Password dialog (admin only) */}
      {role === 'admin' && (
        <Dialog open={pwOpen} onOpenChange={setPwOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
            </DialogHeader>
            {pwSuccess && (
              <p className="text-sm text-green-600">Password changed successfully.</p>
            )}
            <form onSubmit={handlePwSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="nav-new-password" className="text-sm font-medium">New Password</label>
                <Input
                  id="nav-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="nav-confirm-password" className="text-sm font-medium">Confirm Password</label>
                <Input
                  id="nav-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                At least 12 characters with uppercase, lowercase, number, and special character.
              </p>
              {pwError && <p className="text-sm text-destructive">{pwError}</p>}
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setPwOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Saving…' : 'Change Password'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
