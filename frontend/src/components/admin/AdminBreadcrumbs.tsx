import { useLocation } from 'react-router-dom';
import { Breadcrumbs } from '../shared/Breadcrumbs.js';
import type { Crumb } from '../shared/Breadcrumbs.js';
import { ROUTES } from '../../routes.js';

function buildCrumbs(pathname: string, state: unknown): Crumb[] {
  if (pathname === ROUTES.UI.ADMIN.DASHBOARD || pathname === ROUTES.UI.ADMIN.ROOT || pathname === `${ROUTES.UI.ADMIN.ROOT}/`) {
    return [{ label: 'Admin' }];
  }
  if (pathname === ROUTES.UI.ADMIN.USERS) {
    return [
      { label: 'Admin', to: ROUTES.UI.ADMIN.DASHBOARD },
      { label: 'Users' },
    ];
  }
  if (pathname.startsWith(`${ROUTES.UI.ADMIN.USERS}/`)) {
    const username = (state as { user?: { username?: string } } | null)?.user?.username;
    const userId = pathname.split(`${ROUTES.UI.ADMIN.USERS}/`)[1];
    return [
      { label: 'Admin', to: ROUTES.UI.ADMIN.DASHBOARD },
      { label: 'Users', to: ROUTES.UI.ADMIN.USERS },
      { label: username ?? userId },
    ];
  }
  if (pathname === ROUTES.UI.ADMIN.LOGINS) {
    return [
      { label: 'Admin', to: ROUTES.UI.ADMIN.DASHBOARD },
      { label: 'Logs' },
      { label: 'Logins' },
    ];
  }
  if (pathname === ROUTES.UI.ADMIN.AUDIT) {
    return [
      { label: 'Admin', to: ROUTES.UI.ADMIN.DASHBOARD },
      { label: 'Logs' },
      { label: 'Audit' },
    ];
  }
  return [{ label: 'Admin' }];
}

export function AdminBreadcrumbs() {
  const { pathname, state } = useLocation();
  return <Breadcrumbs crumbs={buildCrumbs(pathname, state)} />;
}
