import { useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useAutoLogout } from '../../hooks/useAutoLogout.js';
import { EnvironmentBanner } from '../layout/EnvironmentBanner.js';
import { AdminSidebar } from './AdminSidebar.js';
import { AdminBreadcrumbs } from './AdminBreadcrumbs.js';
import { ShellHeader } from '../shared/ShellHeader.js';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';

const ADMIN_TIMEOUT = Number(import.meta.env.VITE_ADMIN_TIMEOUT_SECONDS ?? 86400);

export function AdminShell() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const { secondsLeft } = useAutoLogout({
    timeoutSeconds: ADMIN_TIMEOUT,
    onLogout: handleLogout,
    active: true,
  });

  return (
    <SidebarProvider>
      <div className="admin-area flex h-screen flex-col w-full">
        <EnvironmentBanner />
        <div className="flex flex-1 overflow-hidden">
          <AdminSidebar
            onLogout={handleLogout}
            onCreateUser={() => navigate('/admin/users?create=1')}
          />
          <SidebarInset className="flex flex-col overflow-hidden">
            <ShellHeader breadcrumbs={<AdminBreadcrumbs />} secondsLeft={secondsLeft} />
            <main className="flex-1 overflow-auto bg-muted p-6">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
