import { useLocation } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
import { Home, UserCog, Settings2, FileTerminal, LogOut } from 'lucide-react';
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

interface NavItemDef {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const topItems: NavItemDef[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: Home, end: true },
];

const managementItems: NavItemDef[] = [
  { to: '/admin/users', label: 'Users', icon: UserCog },
  { to: '/admin/management/admin', label: 'Admin', icon: Settings2 },
];

const logItems: NavItemDef[] = [
  { to: '/admin/logs/logins', label: 'Logins', icon: FileTerminal },
];

function NavItem({ to, label, icon: Icon, end = false }: NavItemDef) {
  const { pathname } = useLocation();
  const isActive = end ? pathname === to : pathname.startsWith(to);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<NavLink to={to} end={end} />}
        isActive={isActive}
        tooltip={label}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

interface AdminSidebarProps {
  username: string;
  onLogout: () => void;
}

export function AdminSidebar({ username, onLogout }: AdminSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex h-14 items-center gap-2 px-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <img src={logo} alt="" className="h-6 w-6 shrink-0" />
          <span className="font-bold text-sm truncate group-data-[collapsible=icon]:hidden">PassVault</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Dashboard */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {topItems.map(item => <NavItem key={item.to} {...item} />)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Management */}
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {managementItems.map(item => <NavItem key={item.to} {...item} />)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Logs */}
        <SidebarGroup>
          <SidebarGroupLabel>Logs</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {logItems.map(item => <NavItem key={item.to} {...item} />)}
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
  );
}
