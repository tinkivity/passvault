import { useLocation } from 'react-router-dom';
import type { VaultSummary, VaultItem } from '@passvault/shared';
import { Breadcrumbs } from '../shared/Breadcrumbs.js';
import type { Crumb } from '../shared/Breadcrumbs.js';

function buildCrumbs(pathname: string, state: unknown): Crumb[] {
  const vaultMatch = pathname.match(/^\/vault\/([^/]+)(\/(.*))?$/);
  if (!vaultMatch) return [{ label: 'Vault' }];

  const vaultId = vaultMatch[1];
  const rest = vaultMatch[3] ?? '';
  const s = state as { vault?: VaultSummary; item?: VaultItem } | null;
  const vaultName = s?.vault?.displayName ?? 'Vault';
  const vaultBase = `/vault/${vaultId}/items`;

  if (rest === '' || rest === 'items') {
    return [{ label: vaultName }];
  }
  if (rest === 'items/new') {
    return [
      { label: vaultName, to: vaultBase },
      { label: 'New' },
    ];
  }
  if (rest.startsWith('items/')) {
    const itemName = s?.item?.name ?? rest.split('/')[1];
    return [
      { label: vaultName, to: vaultBase },
      { label: itemName },
    ];
  }
  return [{ label: vaultName }];
}

export function VaultBreadcrumbs() {
  const { pathname, state } = useLocation();
  return <Breadcrumbs crumbs={buildCrumbs(pathname, state)} />;
}
