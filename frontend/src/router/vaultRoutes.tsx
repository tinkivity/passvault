import type { RouteObject } from 'react-router-dom';
import { VaultUnlockPage } from '../pages/vault/VaultUnlockPage.js';
import { VaultItemsPage } from '../pages/vault/VaultItemsPage.js';
import { VaultItemNewPage } from '../pages/vault/VaultItemNewPage.js';
import { VaultItemDetailPage } from '../pages/vault/VaultItemDetailPage.js';

export const vaultRoutes: RouteObject[] = [
  { index: true, element: <></> },
  { path: ':vaultId', element: <VaultUnlockPage /> },
  { path: ':vaultId/items', element: <VaultItemsPage /> },
  { path: ':vaultId/items/new', element: <VaultItemNewPage /> },
  { path: ':vaultId/items/:itemId', element: <VaultItemDetailPage /> },
];
