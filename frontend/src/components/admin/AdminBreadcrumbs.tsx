import { useLocation } from 'react-router-dom';
import { Breadcrumbs } from '../shared/Breadcrumbs.js';
import type { Crumb } from '../shared/Breadcrumbs.js';

function buildCrumbs(pathname: string, state: unknown): Crumb[] {
  if (pathname === '/ui/admin/dashboard' || pathname === '/ui/admin' || pathname === '/ui/admin/') {
    return [{ label: 'Admin' }];
  }
  if (pathname === '/ui/admin/users') {
    return [
      { label: 'Admin', to: '/ui/admin/dashboard' },
      { label: 'Users' },
    ];
  }
  if (pathname.startsWith('/ui/admin/users/')) {
    const username = (state as { user?: { username?: string } } | null)?.user?.username;
    const userId = pathname.split('/ui/admin/users/')[1];
    return [
      { label: 'Admin', to: '/ui/admin/dashboard' },
      { label: 'Users', to: '/ui/admin/users' },
      { label: username ?? userId },
    ];
  }
  if (pathname === '/ui/admin/logs/logins') {
    return [
      { label: 'Admin', to: '/ui/admin/dashboard' },
      { label: 'Logs' },
      { label: 'Logins' },
    ];
  }
  return [{ label: 'Admin' }];
}

export function AdminBreadcrumbs() {
  const { pathname, state } = useLocation();
  return <Breadcrumbs crumbs={buildCrumbs(pathname, state)} />;
}
