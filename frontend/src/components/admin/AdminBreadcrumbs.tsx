import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Breadcrumbs } from '../shared/Breadcrumbs.js';
import type { Crumb } from '../shared/Breadcrumbs.js';
import { ROUTES } from '../../routes.js';

function buildCrumbs(pathname: string, state: unknown, t: (key: string) => string): Crumb[] {
  if (pathname === ROUTES.UI.ADMIN.DASHBOARD || pathname === ROUTES.UI.ADMIN.ROOT || pathname === `${ROUTES.UI.ADMIN.ROOT}/`) {
    return [{ label: t('common:admin') }];
  }
  if (pathname === ROUTES.UI.ADMIN.USERS) {
    return [
      { label: t('common:admin'), to: ROUTES.UI.ADMIN.DASHBOARD },
      { label: t('common:users') },
    ];
  }
  if (pathname.startsWith(`${ROUTES.UI.ADMIN.USERS}/`)) {
    const username = (state as { user?: { username?: string } } | null)?.user?.username;
    const userId = pathname.split(`${ROUTES.UI.ADMIN.USERS}/`)[1];
    return [
      { label: t('common:admin'), to: ROUTES.UI.ADMIN.DASHBOARD },
      { label: t('common:users'), to: ROUTES.UI.ADMIN.USERS },
      { label: username ?? userId },
    ];
  }
  if (pathname === ROUTES.UI.ADMIN.LOGINS) {
    return [
      { label: t('common:admin'), to: ROUTES.UI.ADMIN.DASHBOARD },
      { label: t('common:logs') },
      { label: t('common:logins') },
    ];
  }
  if (pathname === ROUTES.UI.ADMIN.AUDIT) {
    return [
      { label: t('common:admin'), to: ROUTES.UI.ADMIN.DASHBOARD },
      { label: t('common:logs') },
      { label: t('admin:audit') },
    ];
  }
  return [{ label: t('common:admin') }];
}

export function AdminBreadcrumbs() {
  const { pathname, state } = useLocation();
  const { t } = useTranslation(['common', 'admin']);
  return <Breadcrumbs crumbs={buildCrumbs(pathname, state, t)} />;
}
