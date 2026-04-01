import { Navigate, Outlet } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext.js';
import { ROUTES } from '../routes.js';

export function RequireAdmin() {
  const { role } = useAuthContext();
  if (role !== 'admin') return <Navigate to={ROUTES.UI.ROOT} replace />;
  return <Outlet />;
}
