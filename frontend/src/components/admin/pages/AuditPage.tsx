import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { AuditCategory, AuditConfig, AuditEventSummary, AuditQueryParams } from '@passvault/shared';
import {
  ArrowPathIcon,
  InboxIcon,
  Cog6ToothIcon,
  XMarkIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth.js';
import { api } from '../../../services/api.js';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { DateRangeFilter } from '../DateRangeFilter.js';
import { DataTable } from '../DataTable.js';

// ---- Helpers ----------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 19);
  return `${date} ${time}`;
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatCategory(cat: AuditCategory): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ---- Category tabs ----------------------------------------------------------

const ALL_CATEGORIES: Array<AuditCategory | 'all'> = [
  'all',
  'authentication',
  'admin_actions',
  'vault_operations',
  'system',
];

const categoryLabelKey: Record<AuditCategory | 'all', string> = {
  all: 'allCategories',
  authentication: 'authentication',
  admin_actions: 'adminActions',
  vault_operations: 'vaultOperations',
  system: 'system',
};

const categoryDot: Record<AuditCategory, string> = {
  authentication: 'bg-blue-500',
  admin_actions: 'bg-amber-500',
  vault_operations: 'bg-green-600',
  system: 'bg-purple-500',
};

// ---- Column definitions -----------------------------------------------------

function getAuditColumns(
  t: (key: string) => string,
  sortOrder: 'asc' | 'desc',
  onToggleSort: () => void,
): ColumnDef<AuditEventSummary>[] {
  return [
  {
    accessorKey: 'timestamp',
    header: () => (
      <button
        onClick={onToggleSort}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        type="button"
      >
        {t('timestampUtc')}
        {sortOrder === 'desc' ? (
          <ChevronDownIcon className="h-3.5 w-3.5" />
        ) : (
          <ChevronUpIcon className="h-3.5 w-3.5" />
        )}
      </button>
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground tabular-nums">
        {formatTimestamp(row.original.timestamp)}
      </span>
    ),
  },
  {
    accessorKey: 'category',
    header: t('category'),
    size: 160,
    cell: ({ row }) => {
      const cat = row.original.category;
      const dot = categoryDot[cat];
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
          {formatCategory(cat)}
        </span>
      );
    },
  },
  {
    accessorKey: 'action',
    header: t('action'),
    size: 160,
    cell: ({ row }) => <span>{formatAction(row.original.action)}</span>,
  },
  {
    id: 'user',
    header: t('user'),
    size: 160,
    accessorFn: row => row.username ?? row.userId,
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.username ?? row.original.userId.slice(0, 8)}
      </span>
    ),
  },
  {
    id: 'performedBy',
    header: t('performedBy'),
    size: 160,
    accessorFn: row => row.performedByUsername ?? row.performedBy ?? '',
    cell: ({ row }) => {
      const name = row.original.performedByUsername ?? row.original.performedBy;
      return name ? (
        <span className="font-mono text-xs">{name}</span>
      ) : (
        <span className="text-muted-foreground">--</span>
      );
    },
  },
  {
    id: 'details',
    header: t('details'),
    cell: ({ row }) => {
      const details = row.original.details;
      if (!details) return <span className="text-muted-foreground">--</span>;
      const entries = Object.entries(details);
      return (
        <span className="text-xs text-muted-foreground">
          {entries.map(([k, v]) => `${k}=${v}`).join(', ')}
        </span>
      );
    },
  },
  ];
}

// ---- Settings panel ---------------------------------------------------------

function AuditSettings({
  config,
  onUpdate,
  loading,
}: {
  config: AuditConfig;
  onUpdate: (config: AuditConfig) => void;
  loading: boolean;
}) {
  const { t } = useTranslation('admin');
  const categories: AuditCategory[] = ['authentication', 'admin_actions', 'vault_operations', 'system'];

  return (
    <div className="border border-base-300 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium">{t('auditCategories')}</h3>
      <p className="text-xs text-muted-foreground">
        {t('auditCategoriesDesc')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {categories.map(cat => (
          <label key={cat} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={config[cat]}
              disabled={loading}
              onChange={e => onUpdate({ ...config, [cat]: e.target.checked })}
            />
            <span className="text-sm">{formatCategory(cat)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---- Main component ---------------------------------------------------------

export function AuditPage() {
  const { token } = useAuth();
  const { t } = useTranslation('admin');
  const [events, setEvents] = useState<AuditEventSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTab, setSelectedTab] = useState<AuditCategory | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination state
  const [pageSize, setPageSize] = useState(50);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [prevTokens, setPrevTokens] = useState<Array<string | undefined>>([]);
  const [currentToken, setCurrentToken] = useState<string | undefined>();

  const [showSettings, setShowSettings] = useState(false);
  const [auditConfig, setAuditConfig] = useState<AuditConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const auditColumns = useMemo(
    () => getAuditColumns(t, sortOrder, () => {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, sortOrder],
  );

  const loadEvents = useCallback(async (tokenOverride?: string | undefined) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params: AuditQueryParams = {
        limit: pageSize,
        sort: sortOrder,
      };
      if (selectedTab !== 'all') params.category = selectedTab;
      if (dateFrom) params.from = new Date(dateFrom).toISOString();
      if (dateTo) {
        const d = new Date(dateTo);
        d.setDate(d.getDate() + 1);
        params.to = d.toISOString();
      }
      if (actionFilter.trim()) params.action = actionFilter.trim() as AuditQueryParams['action'];
      if (userIdFilter.trim()) params.userId = userIdFilter.trim();
      if (tokenOverride) params.nextToken = tokenOverride;

      const result = await api.getAuditEvents(params, token);
      setEvents(result.events);
      setNextToken(result.nextToken);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit events');
    } finally {
      setLoading(false);
    }
  }, [token, selectedTab, dateFrom, dateTo, actionFilter, userIdFilter, pageSize, sortOrder]);

  const loadConfig = useCallback(async () => {
    if (!token) return;
    setConfigLoading(true);
    try {
      const config = await api.getAuditConfig(token);
      setAuditConfig(config);
    } catch {
      // non-critical
    } finally {
      setConfigLoading(false);
    }
  }, [token]);

  // Initial load
  useEffect(() => {
    if (!token || loaded) return;
    loadEvents();
    loadConfig();
  }, [token, loaded, loadEvents, loadConfig]);

  // Reset pagination and re-fetch when filters change
  useEffect(() => {
    if (!token || !loaded) return;
    // Debounce 300ms for text filter changes
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPrevTokens([]);
      setCurrentToken(undefined);
      setNextToken(undefined);
      loadEvents();
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, dateFrom, dateTo, actionFilter, userIdFilter, pageSize, sortOrder]);

  const handleUpdateConfig = useCallback(async (config: AuditConfig) => {
    if (!token) return;
    setConfigLoading(true);
    try {
      const updated = await api.updateAuditConfig(config, token);
      setAuditConfig(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update config');
    } finally {
      setConfigLoading(false);
    }
  }, [token]);

  function goNextPage() {
    if (!nextToken) return;
    setPrevTokens(prev => [...prev, currentToken]);
    setCurrentToken(nextToken);
    loadEvents(nextToken);
  }

  function goPrevPage() {
    const prev = [...prevTokens];
    const tok = prev.pop();
    setPrevTokens(prev);
    setCurrentToken(tok);
    loadEvents(tok);
  }

  const hasFilters = actionFilter.trim() !== '' || userIdFilter.trim() !== '';

  function clearFilters() {
    setActionFilter('');
    setUserIdFilter('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">{t('auditLog')}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowSettings(!showSettings)}
            title={t('settings')}
            aria-label={t('settings')}
          >
            <Cog6ToothIcon className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setPrevTokens([]);
              setCurrentToken(undefined);
              setNextToken(undefined);
              setLoaded(false);
            }}
            disabled={loading}
            title={t('common:refresh')}
            aria-label={t('common:refresh')}
          >
            <ArrowPathIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {/* Settings panel */}
      {showSettings && auditConfig && (
        <div className="mb-4">
          <AuditSettings
            config={auditConfig}
            onUpdate={handleUpdateConfig}
            loading={configLoading}
          />
        </div>
      )}

      <div className="space-y-4">
        {/* Category tabs */}
        <div className="flex gap-1 border-b border-base-300">
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => { setSelectedTab(cat); }}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                selectedTab === cat
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(categoryLabelKey[cat])}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            placeholder={t('filterByAction')}
            className="input input-bordered input-sm h-8 w-40 text-sm"
            aria-label={t('filterByAction')}
          />

          <input
            type="text"
            value={userIdFilter}
            onChange={e => setUserIdFilter(e.target.value)}
            placeholder={t('filterByUserId')}
            className="input input-bordered input-sm h-8 w-40 text-sm"
            aria-label={t('filterByUserId')}
          />

          <DateRangeFilter
            label={t('date')}
            ariaLabel={t('filterByDate')}
            from={dateFrom}
            to={dateTo}
            onFrom={v => setDateFrom(v)}
            onTo={v => setDateTo(v)}
          />

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 lg:px-3"
              onClick={clearFilters}
            >
              {t('common:reset')}
              <XMarkIcon className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowPathIcon className="w-4 h-4 animate-spin" />
            {t('loadingAuditEvents')}
          </div>
        )}

        {/* Table or empty state */}
        {!loaded && !loading ? null : loaded && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <InboxIcon className="w-10 h-10 mb-3" />
            <p className="font-medium">{t('noAuditEventsYet')}</p>
            <p className="text-sm mt-1">{t('auditEventsAppearHere')}</p>
          </div>
        ) : (
          <DataTable
            columns={auditColumns}
            data={events}
            loading={loading && !loaded}
            loadingLabel={t('loadingAuditEvents')}
            emptyMessage={hasFilters ? t('noEventsMatchCurrentFilters') : t('noAuditEventsYet')}
            defaultSorting={[]}
          />
        )}

        {/* Pagination controls */}
        {loaded && events.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{t('pageSize')}</span>
              <Select
                value={String(pageSize)}
                onValueChange={v => setPageSize(Number(v))}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <span>{pageSize}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {events.length} {events.length === 1 ? t('common:event') : t('common:events')}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={goPrevPage}
                disabled={prevTokens.length === 0 || loading}
                title={t('common:previousPage')}
                aria-label={t('common:previousPage')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={goNextPage}
                disabled={!nextToken || loading}
                title={t('common:nextPage')}
                aria-label={t('common:nextPage')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
