import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom';
import { useAuthContext } from './context/AuthContext.js';
import { LoginPage } from './components/auth/LoginPage.js';
import { PasswordChangePage } from './components/auth/PasswordChangePage.js';
import { PasskeySetupPage } from './components/auth/PasskeySetupPage.js';
import { VaultPage } from './components/vault/VaultPage.js';
import { AdminShell } from './components/admin/AdminShell.js';
import { DashboardPage } from './components/admin/pages/DashboardPage.js';
import { UsersPage } from './components/admin/pages/UsersPage.js';
import { UserDetailPage } from './components/admin/pages/UserDetailPage.js';
import { LoginsPage } from './components/admin/pages/LoginsPage.js';
import { AdminPage } from './components/admin/pages/AdminPage.js';

// ---- Guards ---------------------------------------------------------------

function RequireAuth({ requiredRole }: { requiredRole?: 'admin' | 'user' }) {
  const { token, role, status } = useAuthContext();

  if (!token) return <Navigate to="/login" replace />;
  if (requiredRole && role !== requiredRole) return <Navigate to="/login" replace />;

  // Redirect users mid-onboarding to the right step
  if (status === 'pending_first_login') {
    const path = role === 'admin' ? '/admin/change-password' : '/change-password';
    return <Navigate to={path} replace />;
  }
  if (status === 'pending_passkey_setup') {
    const path = role === 'admin' ? '/admin/passkey-setup' : '/passkey-setup';
    return <Navigate to={path} replace />;
  }

  return <Outlet />;
}

function RequireOnboarding(props: { step: 'password' | 'passkey'; isAdmin?: boolean }) {
  const { token, status } = useAuthContext();
  if (!token) return <Navigate to="/login" replace />;

  const expectedStatus = props.step === 'password' ? 'pending_first_login' : 'pending_passkey_setup';
  if (status !== expectedStatus) {
    return <Navigate to={props.isAdmin ? '/admin/dashboard' : '/vault'} replace />;
  }

  return <Outlet />;
}

// ---- Router ---------------------------------------------------------------

export const router = createBrowserRouter([
  { index: true, element: <Navigate to="/login" replace /> },

  // User login
  { path: '/login', element: <LoginPage /> },

  // User onboarding
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

  // Vault (authenticated user)
  {
    path: '/vault',
    element: <RequireAuth requiredRole="user" />,
    children: [{ index: true, element: <VaultPage /> }],
  },

  // Admin onboarding
  {
    path: '/admin/change-password',
    element: <RequireOnboarding step="password" isAdmin />,
    children: [{ index: true, element: <PasswordChangePage isAdmin /> }],
  },
  {
    path: '/admin/passkey-setup',
    element: <RequireOnboarding step="passkey" isAdmin />,
    children: [{ index: true, element: <PasskeySetupPage isAdmin /> }],
  },

  // Admin shell + pages (authenticated admin)
  {
    path: '/admin',
    element: <RequireAuth requiredRole="admin" />,
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      {
        element: <AdminShell />,
        children: [
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'users', element: <UsersPage /> },
          { path: 'users/:userId', element: <UserDetailPage /> },
          { path: 'logs/logins', element: <LoginsPage /> },
          { path: 'management/admin', element: <AdminPage /> },
        ],
      },
    ],
  },

  // Fallback
  { path: '*', element: <Navigate to="/login" replace /> },
]);
