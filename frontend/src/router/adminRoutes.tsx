import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { DashboardPage } from '../pages/admin/DashboardPage.js';
import { UsersPage } from '../pages/admin/UsersPage.js';
import { UserDetailPage } from '../pages/admin/UserDetailPage.js';
import { LoginsPage } from '../pages/admin/LoginsPage.js';
import { AuditPage } from '../pages/admin/AuditPage.js';
import { EmailTemplatesPage } from '../pages/admin/EmailTemplatesPage.js';
import { RequireAdmin } from '../guards/RequireAdmin.js';
import { ROUTES } from '../routes.js';

export const adminRoutes: RouteObject[] = [
  {
    element: <RequireAdmin />,
    children: [
      { index: true, element: <Navigate to={ROUTES.UI.ADMIN.DASHBOARD} replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'users/:userId', element: <UserDetailPage /> },
      /** @deprecated Use logs/audit instead */
      { path: 'logs/logins', element: <LoginsPage /> },
      { path: 'logs/audit', element: <AuditPage /> },
      { path: 'email-templates', element: <EmailTemplatesPage /> },
    ],
  },
];
