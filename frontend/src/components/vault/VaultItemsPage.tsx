import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, TriangleAlert } from 'lucide-react';
import type { VaultFile, VaultItem, VaultItemCategory } from '@passvault/shared';
import { useAuth } from '../../hooks/useAuth.js';
import { useVault } from '../../hooks/useVault.js';
import { useVaultShellContext } from './VaultShell.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const CATEGORY_LABELS: Record<VaultItemCategory, string> = {
  note: 'Note',
  login: 'Login',
  email: 'Email',
  credit_card: 'Credit Card',
  identity: 'Identity',
  wifi: 'Wi-Fi',
  private_key: 'Private Key',
};

const CATEGORY_COLORS: Record<VaultItemCategory, string> = {
  note: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  login: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  email: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  credit_card: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  identity: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  wifi: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  private_key: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

function getDisplayField(item: VaultItem): string {
  switch (item.category) {
    case 'note': return '';
    case 'login': return item.username;
    case 'email': return item.emailAddress;
    case 'credit_card': return '·· ' + item.cardNumber.slice(-4);
    case 'identity': return `${item.firstName} ${item.lastName}`;
    case 'wifi': return item.ssid;
    case 'private_key': return item.keyType ?? '';
  }
}

export function VaultItemsPage() {
  const { vaultId } = useParams<{ vaultId: string }>();
  const navigate = useNavigate();
  const { token, status } = useAuth();
  const { catalog, vaults } = useVaultShellContext();
  const { loading, error, fetchAndDecrypt } = useVault(vaultId ?? null, token);

  const [vaultFile, setVaultFile] = useState<VaultFile | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<VaultItemCategory | ''>('');

  const vault = vaults.find(v => v.vaultId === vaultId);
  const isExpired = status === 'expired';

  useEffect(() => {
    if (!vaultId) return;
    fetchAndDecrypt().then(setVaultFile).catch(() => { });
  }, [vaultId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredItems = useMemo(() => {
    if (!vaultFile) return [];
    return vaultFile.items.filter(item => {
      const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = !categoryFilter || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [vaultFile, search, categoryFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold truncate">{vault?.displayName ?? 'Vault'}</h1>
        {!isExpired && (
          <Button size="sm" onClick={() => navigate(`/vault/${vaultId}/items/new`, { state: { vault } })}>
            <Plus className="h-4 w-4 mr-1" />
            New Item
          </Button>
        )}
      </div>

      {isExpired && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-200">
          Your account has expired — vault is read-only.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          className="rounded-md border border-input bg-background px-3 py-1 text-sm"
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value as VaultItemCategory | '')}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {(Object.keys(CATEGORY_LABELS) as VaultItemCategory[]).map(cat => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
          ))}
        </select>
      </div>

      {loading && !vaultFile && (
        <div className="text-sm text-muted-foreground">Loading…</div>
      )}

      {vaultFile && (
        <div className="rounded-md border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {vaultFile.items.length === 0 ? 'No items yet. Add your first item.' : 'No items match your filter.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map(item => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/vault/${vaultId}/items/${item.id}`, { state: { vault, item } })}
                  >
                    <TableCell className="w-8">
                      {item.warningCodes.length > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <TriangleAlert className="h-4 w-4 text-yellow-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <ul className="text-xs space-y-0.5">
                                {item.warningCodes.map(code => (
                                  <li key={code}>{catalog.find(d => d.code === code)?.label ?? code}</li>
                                ))}
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[item.category]}`}>
                        {CATEGORY_LABELS[item.category]}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{getDisplayField(item)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
