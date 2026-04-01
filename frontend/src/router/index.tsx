import { Navigate, createBrowserRouter } from 'react-router-dom';
import { VaultShell } from '../components/vault/VaultShell.js';
import { RequireAuth } from '../guards/RequireAuth.js';
import { ROUTES } from '../routes.js';
import { authRoutes } from './authRoutes.js';
import { vaultRoutes } from './vaultRoutes.js';
import { adminRoutes } from './adminRoutes.js';

export const router = createBrowserRouter([
  { index: true, element: <Navigate to={ROUTES.LOGIN} replace /> },

  ...authRoutes,

  {
    path: ROUTES.UI.ROOT,
    element: <RequireAuth />,
    children: [
      {
        element: <VaultShell />,
        children: [
          ...vaultRoutes,
          { path: 'admin', children: adminRoutes },
        ],
      },
    ],
  },

  { path: '*', element: <Navigate to={ROUTES.LOGIN} replace /> },
]);
