import { Link, useLocation } from 'react-router-dom';
import type { VaultSummary, VaultItem } from '@passvault/shared';

type Crumb = { label: string; to?: string };

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
  const crumbs = buildCrumbs(pathname, state);

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && <span className="text-muted-foreground select-none shrink-0">›</span>}
            {isLast || !crumb.to ? (
              <span className={`truncate ${isLast ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {crumb.label}
              </span>
            ) : (
              <Link
                to={crumb.to}
                className="text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
