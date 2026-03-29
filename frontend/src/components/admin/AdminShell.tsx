import { useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../hooks/useAuth.js';
import { useAutoLogout } from '../../hooks/useAutoLogout.js';
import { useTheme } from '../../hooks/useTheme.js';
import { EnvironmentBanner } from '../layout/EnvironmentBanner.js';
import { AdminSidebar } from './AdminSidebar.js';
import { AdminBreadcrumbs } from './AdminBreadcrumbs.js';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';

const ADMIN_TIMEOUT = Number(import.meta.env.VITE_ADMIN_TIMEOUT_SECONDS ?? 86400);

export function AdminShell() {
  const navigate = useNavigate();
  const { username, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const { secondsLeft } = useAutoLogout({
    timeoutSeconds: ADMIN_TIMEOUT,
    onLogout: handleLogout,
    active: true,
  });

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const timeDisplay = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return (
    <SidebarProvider>
      <div className="admin-area flex h-screen flex-col w-full">
        <EnvironmentBanner />
        <div className="flex flex-1 overflow-hidden">
          <AdminSidebar
            username={username ?? ''}
            onLogout={handleLogout}
            onCreateUser={() => navigate('/admin/users?create=1')}
          />
          <SidebarInset className="flex flex-col overflow-hidden">
            <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <div className="flex-1 min-w-0">
                <AdminBreadcrumbs />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-sm text-foreground/60 hidden sm:inline mr-2">{timeDisplay}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={toggleTheme}
                  title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                  aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDark
                    ? <SunIcon className="w-4 h-4" />
                    : <MoonIcon className="w-4 h-4" />}
                </Button>
              </div>
            </header>
            <main className="flex-1 overflow-auto bg-muted p-6">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
