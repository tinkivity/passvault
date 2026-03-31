import { useLocation } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
import { Home, UserCog, FileTerminal, MoreHorizontal, UserPlus } from 'lucide-react';
import logo from '../../assets/logo.png';
import { NavUser } from '../shared/NavUser.js';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItemDef {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const topItems: NavItemDef[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: Home, end: true },
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
  onLogout: () => void;
  onCreateUser?: () => void;
}

export function AdminSidebar({ onLogout, onCreateUser }: AdminSidebarProps) {
  const { pathname } = useLocation();

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
              {/* Users — with 3-dot action menu */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<NavLink to="/admin/users" />}
                  isActive={pathname.startsWith('/admin/users')}
                  tooltip="Users"
                >
                  <UserCog className="h-4 w-4 shrink-0" />
                  <span>Users</span>
                </SidebarMenuButton>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<SidebarMenuAction showOnHover />}>
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">More</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start">
                    <DropdownMenuItem onClick={onCreateUser}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Create user
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
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
        <NavUser role="admin" onLogout={onLogout} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
