import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom';
import { useAuthContext } from './context/AuthContext.js';
import { LoginPage } from './components/auth/LoginPage.js';
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

// ---- Guards ---------------------------------------------------------------

function RequireAuth() {
  const { token, role, status } = useAuthContext();

  if (!token) return <Navigate to="/login" replace />;

  // Redirect users mid-onboarding to the right step
  if (status === 'pending_first_login') {
    return <Navigate to="/change-password" replace />;
  }
  if (status === 'pending_passkey_setup') {
    return <Navigate to="/passkey-setup" replace />;
  }

  // Admin-only guard for admin sub-routes — handled via RequireAdmin below
  void role;

  return <Outlet />;
}

function RequireAdmin() {
  const { role } = useAuthContext();
  if (role !== 'admin') return <Navigate to="/ui" replace />;
  return <Outlet />;
}

function RequireOnboarding(props: { step: 'password' | 'passkey' }) {
  const { token, status } = useAuthContext();
  if (!token) return <Navigate to="/login" replace />;

  const expectedStatus = props.step === 'password' ? 'pending_first_login' : 'pending_passkey_setup';
  if (status !== expectedStatus) {
    return <Navigate to="/ui" replace />;
  }

  return <Outlet />;
}

// ---- Router ---------------------------------------------------------------

export const router = createBrowserRouter([
  { index: true, element: <Navigate to="/login" replace /> },

  // Login (both user and admin)
  { path: '/login', element: <LoginPage /> },

  // Onboarding (both user and admin share same routes)
  {
    path: '/change-password',
    element: <RequireOnboarding step="password" />,
    children: [{ index: true, element: <PasswordChangePage /> }],
  },
  {
    path: '/passkey-setup',
    element: <RequireOnboarding step="passkey" />,
    children: [{ index: true, element: <PasskeySetupPage /> }],
  },

  // UI shell — unified for users and admins
  {
    path: '/ui',
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
              { index: true, element: <Navigate to="/ui/admin/dashboard" replace /> },
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'users', element: <UsersPage /> },
              { path: 'users/:userId', element: <UserDetailPage /> },
              { path: 'logs/logins', element: <LoginsPage /> },
            ],
          },
        ],
      },
    ],
  },

  // Fallback
  { path: '*', element: <Navigate to="/login" replace /> },
]);
