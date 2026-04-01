import type { RouteObject } from 'react-router-dom';
import { LoginPage } from '../pages/auth/LoginPage.js';
import { PasswordChangePage } from '../pages/auth/PasswordChangePage.js';
import { PasskeySetupPage } from '../pages/auth/PasskeySetupPage.js';
import { RequireOnboarding } from '../guards/RequireOnboarding.js';
import { ROUTES } from '../routes.js';

export const authRoutes: RouteObject[] = [
  { path: ROUTES.LOGIN, element: <LoginPage /> },
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
];
