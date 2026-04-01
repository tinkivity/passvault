import { Navigate, Outlet } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext.js';
import { ROUTES } from '../routes.js';

export function RequireOnboarding(props: { step: 'password' | 'passkey' }) {
  const { token, status } = useAuthContext();
  if (!token) return <Navigate to={ROUTES.LOGIN} replace />;

  const expectedStatus = props.step === 'password' ? 'pending_first_login' : 'pending_passkey_setup';
  if (status !== expectedStatus) {
    return <Navigate to={ROUTES.UI.ROOT} replace />;
  }

  return <Outlet />;
}
