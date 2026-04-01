import { useState } from 'react';
import { ChevronsUpDown, LogOut, BadgeCheck, Bell, Sparkles, KeyRound } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { AccountDialog } from './AccountDialog.js';
import { NotificationsDialog } from './NotificationsDialog.js';
import { ChangePasswordDialog } from './ChangePasswordDialog.js';
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

interface NavUserProps {
  onLogout: () => void;
}

export function NavUser({ onLogout }: NavUserProps) {
  const { username, firstName, displayName, role, plan } = useAuth();
  const { isMobile } = useSidebar();

  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const label = displayName ?? firstName ?? username ?? '';
  const initials = label[0]?.toUpperCase() ?? '?';
  const planLabel = plan === 'administrator' ? 'Administrator' : (plan === 'pro' ? 'Pro Plan' : 'Free Plan');

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
                <DropdownMenuItem onClick={() => setPwOpen(true)}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Change Password
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={onLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />
      {role === 'user' && (
        <NotificationsDialog open={notifOpen} onOpenChange={setNotifOpen} />
      )}
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </>
  );
}
