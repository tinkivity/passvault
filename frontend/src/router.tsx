import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom';
import { useAuthContext } from './context/AuthContext.js';
import { ROUTES } from './routes.js';
import { LoginPage } from './components/auth/LoginPage.js';
import { OnboardingPage } from './components/auth/OnboardingPage.js';
import { PasswordChangePage } from './components/auth/PasswordChangePage.js';
import { PasskeySetupPage } from './components/auth/PasskeySetupPage.js';
import { VaultShell } from './components/vault/VaultShell.js';
import { VaultUnlockPage } from './components/vault/pages/VaultUnlockPage.js';
import { VaultItemsPage } from './components/vault/pages/VaultItemsPage.js';
import { VaultItemNewPage } from './components/vault/pages/VaultItemNewPage.js';
import { VaultItemDetailPage } from './components/vault/pages/VaultItemDetailPage.js';
import { DashboardPage } from './components/admin/pages/DashboardPage.js';
import { UsersPage } from './components/admin/pages/UsersPage.js';
import { UserDetailPage } from './components/admin/pages/UserDetailPage.js';
import { LoginsPage } from './components/admin/pages/LoginsPage.js';
import { AuditPage } from './components/admin/pages/AuditPage.js';
import { EmailTemplatesPage } from './components/admin/pages/EmailTemplatesPage.js';

// ---- Guards ---------------------------------------------------------------

function RequireAuth() {
  const { token, role, status } = useAuthContext();

  if (!token) return <Navigate to={ROUTES.LOGIN} replace />;

  // Redirect users mid-onboarding to the right step
  if (status === 'pending_first_login') {
    return <Navigate to={role === 'admin' ? ROUTES.CHANGE_PASSWORD : ROUTES.ONBOARDING} replace />;
  }
  if (status === 'pending_passkey_setup') {
    return <Navigate to={ROUTES.PASSKEY_SETUP} replace />;
  }

  // Admin-only guard for admin sub-routes — handled via RequireAdmin below
  void role;

  return <Outlet />;
}

function RequireAdmin() {
  const { role } = useAuthContext();
  if (role !== 'admin') return <Navigate to={ROUTES.UI.ROOT} replace />;
  return <Outlet />;
}

function RequireOnboarding(props: { step: 'onboarding' | 'password' | 'passkey' }) {
  const { token, status } = useAuthContext();
  if (!token) return <Navigate to={ROUTES.LOGIN} replace />;

  const expectedStatus =
    props.step === 'passkey' ? 'pending_passkey_setup' : 'pending_first_login';
  if (status !== expectedStatus) {
    return <Navigate to={ROUTES.UI.ROOT} replace />;
  }

  return <Outlet />;
}

// ---- Router ---------------------------------------------------------------

export const router = createBrowserRouter([
  { index: true, element: <Navigate to={ROUTES.LOGIN} replace /> },

  // Login (both user and admin)
  { path: ROUTES.LOGIN, element: <LoginPage /> },

  // Onboarding
  {
    path: ROUTES.ONBOARDING,
    element: <RequireOnboarding step="onboarding" />,
    children: [{ index: true, element: <OnboardingPage /> }],
  },
  {
    path: ROUTES.CHANGE_PASSWORD,
    element: <RequireOnboarding step="password" />,
    children: [{ index: true, element: <PasswordChangePage /> }],
  },
  {
    path: ROUTES.PASSKEY_SETUP,
    element: <RequireOnboarding step="passkey" />,
    children: [{ index: true, element: <PasskeySetupPage /> }],
  },

  // UI shell — unified for users and admins
  {
    path: ROUTES.UI.ROOT,
    element: <RequireAuth />,
    children: [
      {
        element: <VaultShell />,
        children: [
          { index: true, element: <></> },
          { path: ':vaultId', element: <VaultUnlockPage /> },
          { path: ':vaultId/items', element: <VaultItemsPage /> },
          { path: ':vaultId/items/new', element: <VaultItemNewPage /> },
          { path: ':vaultId/items/:itemId', element: <VaultItemDetailPage /> },

          // Admin pages nested inside VaultShell
          {
            path: 'admin',
            element: <RequireAdmin />,
            children: [
              { index: true, element: <Navigate to={ROUTES.UI.ADMIN.DASHBOARD} replace /> },
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'users', element: <UsersPage /> },
              { path: 'users/:userId', element: <UserDetailPage /> },
              { path: 'logs/logins', element: <LoginsPage /> },
              { path: 'logs/audit', element: <AuditPage /> },
              { path: 'email-templates', element: <EmailTemplatesPage /> },
            ],
          },
        ],
      },
    ],
  },

  // Fallback
  { path: '*', element: <Navigate to={ROUTES.LOGIN} replace /> },
]);
