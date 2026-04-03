import { Navigate, Outlet } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext.js';
import { ROUTES } from '../routes.js';

export function RequireAuth() {
  const { token, role, status } = useAuthContext();

  if (!token) return <Navigate to={ROUTES.LOGIN} replace />;

  if (status === 'pending_first_login') {
    return <Navigate to={role === 'admin' ? ROUTES.CHANGE_PASSWORD : ROUTES.ONBOARDING} replace />;
  }
  if (status === 'pending_passkey_setup') {
    return <Navigate to={ROUTES.PASSKEY_SETUP} replace />;
  }

  void role;

  return <Outlet />;
}
