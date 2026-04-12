import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronsUpDown, LogOut, BadgeCheck, Bell, Sparkles, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { AccountDialog } from './AccountDialog.js';
import { NotificationsDialog } from './NotificationsDialog.js';
import { SecurityDialog } from './SecurityDialog.js';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { puppySrc } from '../../utils/puppy-hash.js';
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
  const { username, firstName, displayName, role, plan, userId, avatarBase64 } = useAuth();
  const { isMobile } = useSidebar();
  const { t } = useTranslation();

  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

  const label = displayName ?? firstName ?? username ?? '';
  const initials = label[0]?.toUpperCase() ?? '?';
  const planLabel = plan === 'administrator' ? t('planAdmin') : (plan === 'pro' ? t('planPro') : t('planFree'));
  const avatarSrc = avatarBase64
    ? `data:image/jpeg;base64,${avatarBase64}`
    : puppySrc(userId ?? '');

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
                    <AvatarImage src={avatarSrc} className="rounded-lg" />
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
                      <AvatarImage src={avatarSrc} className="rounded-lg" />
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
                      {t('upgradeToPro')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Account (both) + Notifications (user only) */}
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setAccountOpen(true)}>
                  <BadgeCheck className="mr-2 h-4 w-4" />
                  {t('account')}
                </DropdownMenuItem>
                {role === 'user' && (
                  <DropdownMenuItem onClick={() => setNotifOpen(true)}>
                    <Bell className="mr-2 h-4 w-4" />
                    {t('notifications')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setSecurityOpen(true)}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  {t('security')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={onLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                {t('logOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />
      {role === 'user' && (
        <NotificationsDialog open={notifOpen} onOpenChange={setNotifOpen} />
      )}
      <SecurityDialog open={securityOpen} onOpenChange={setSecurityOpen} />
    </>
  );
}
