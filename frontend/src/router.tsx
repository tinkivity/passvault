import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom';
import { useAuthContext } from './context/AuthContext.js';
import { LoginPage } from './components/auth/LoginPage.js';
import { AdminLoginPage } from './components/auth/AdminLoginPage.js';
import { PasswordChangePage } from './components/auth/PasswordChangePage.js';
import { TotpSetupPage } from './components/auth/TotpSetupPage.js';
import { VaultPage } from './components/vault/VaultPage.js';
import { AdminDashboard } from './components/admin/AdminDashboard.js';

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
  if (status === 'pending_totp_setup') {
    const path = role === 'admin' ? '/admin/totp-setup' : '/totp-setup';
    return <Navigate to={path} replace />;
  }

  return <Outlet />;
}

function RequireOnboarding(props: { step: 'password' | 'totp'; isAdmin?: boolean }) {
  const { token, status } = useAuthContext();
  if (!token) return <Navigate to="/login" replace />;

  const expectedStatus = props.step === 'password' ? 'pending_first_login' : 'pending_totp_setup';
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
    path: '/totp-setup',
    element: <RequireOnboarding step="totp" />,
    children: [{ index: true, element: <TotpSetupPage /> }],
  },

  // Vault (authenticated user)
  {
    path: '/vault',
    element: <RequireAuth requiredRole="user" />,
    children: [{ index: true, element: <VaultPage /> }],
  },

  // Admin login
  { path: '/admin/login', element: <AdminLoginPage /> },

  // Admin onboarding
  {
    path: '/admin/change-password',
    element: <RequireOnboarding step="password" isAdmin />,
    children: [{ index: true, element: <PasswordChangePage isAdmin /> }],
  },
  {
    path: '/admin/totp-setup',
    element: <RequireOnboarding step="totp" isAdmin />,
    children: [{ index: true, element: <TotpSetupPage isAdmin /> }],
  },

  // Admin dashboard (authenticated admin)
  {
    path: '/admin/dashboard',
    element: <RequireAuth requiredRole="admin" />,
    children: [{ index: true, element: <AdminDashboard /> }],
  },

  // Fallback
  { path: '*', element: <Navigate to="/login" replace /> },
]);
