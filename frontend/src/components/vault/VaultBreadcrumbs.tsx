import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { VaultSummary, VaultItem } from '@passvault/shared';
import { Breadcrumbs } from '../shared/Breadcrumbs.js';
import type { Crumb } from '../shared/Breadcrumbs.js';
import { ROUTES } from '../../routes.js';
import { useVaultShellContext } from './VaultShell.js';

function buildCrumbs(pathname: string, state: unknown, vaults: VaultSummary[], t: (key: string) => string): Crumb[] {
  const vaultMatch = pathname.match(/^\/ui\/([^/]+)(\/(.*))?$/);
  if (!vaultMatch) return [{ label: t('vault:vault') }];

  const vaultId = vaultMatch[1];
  const rest = vaultMatch[3] ?? '';
  const s = state as { vault?: VaultSummary; item?: VaultItem } | null;
  const vaultFromContext = vaults.find(v => v.vaultId === vaultId);
  const vaultName = s?.vault?.displayName ?? vaultFromContext?.displayName ?? t('vault:vault');
  const vaultBase = ROUTES.UI.ITEMS(vaultId);

  if (rest === '' || rest === 'items') {
    return [{ label: vaultName }];
  }
  if (rest === 'items/new') {
    return [
      { label: vaultName, to: vaultBase },
      { label: t('vault:newItem') },
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
  const { t } = useTranslation();
  const { vaults } = useVaultShellContext();
  return <Breadcrumbs crumbs={buildCrumbs(pathname, state, vaults, t)} />;
}
