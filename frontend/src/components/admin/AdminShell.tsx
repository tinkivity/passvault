import { useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../hooks/useAuth.js';
import { useAutoLogout } from '../../hooks/useAutoLogout.js';
import { EnvironmentBanner } from '../layout/EnvironmentBanner.js';
import { AdminSidebar } from './AdminSidebar.js';
import { AdminBreadcrumbs } from './AdminBreadcrumbs.js';

const ADMIN_TIMEOUT = Number(import.meta.env.VITE_ADMIN_TIMEOUT_SECONDS ?? 86400);

export function AdminShell() {
  const navigate = useNavigate();
  const { username, logout } = useAuth();

  const handleLogout = useCallback(() => {
    logout();
    navigate('/admin/login', { replace: true });
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
    <div className="h-screen flex flex-col overflow-hidden">
      <EnvironmentBanner />
      <header className="h-14 flex items-center px-4 bg-base-100 border-b border-base-300 shrink-0 gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-base-content">PassVault</span>
          <span className="text-base-content/40 text-sm hidden sm:inline">Admin Console</span>
        </div>
        <div className="flex-1 min-w-0">
          <AdminBreadcrumbs />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-base-content/60 hidden sm:inline">
            {username} · {timeDisplay}
          </span>
          <button
            className="btn btn-sm btn-ghost text-error flex items-center gap-1.5"
            onClick={handleLogout}
          >
            <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-auto p-6 bg-base-200">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
