import { useLocation } from 'react-router-dom';
import { Breadcrumbs } from '../shared/Breadcrumbs.js';
import type { Crumb } from '../shared/Breadcrumbs.js';

function buildCrumbs(pathname: string, state: unknown): Crumb[] {
  if (pathname === '/admin/dashboard' || pathname === '/admin' || pathname === '/admin/') {
    return [{ label: 'Admin' }];
  }
  if (pathname === '/admin/users') {
    return [
      { label: 'Admin', to: '/admin/dashboard' },
      { label: 'Users' },
    ];
  }
  if (pathname.startsWith('/admin/users/')) {
    const username = (state as { user?: { username?: string } } | null)?.user?.username;
    const userId = pathname.split('/admin/users/')[1];
    return [
      { label: 'Admin', to: '/admin/dashboard' },
      { label: 'Users', to: '/admin/users' },
      { label: username ?? userId },
    ];
  }
  if (pathname === '/admin/logs/logins') {
    return [
      { label: 'Admin', to: '/admin/dashboard' },
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
