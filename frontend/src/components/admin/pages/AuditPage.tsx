import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { AuditCategory, AuditConfig, AuditEventSummary } from '@passvault/shared';
import {
  ArrowPathIcon,
  InboxIcon,
  Cog6ToothIcon,
  XMarkIcon,
  PlusCircleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../../hooks/useAuth.js';
import { api } from '../../../services/api.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
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

// ---- Faceted filter ---------------------------------------------------------

function FacetedFilter<T extends string>({
  label,
  ariaLabel,
  options,
  getLabel,
  getDot,
  selected,
  onToggle,
  onClear,
  clearLabel = 'Clear filters',
}: {
  label: string;
  ariaLabel: string;
  options: T[];
  getLabel: (v: T) => string;
  getDot?: (v: T) => string;
  selected: Set<T>;
  onToggle: (v: T) => void;
  onClear: () => void;
  clearLabel?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger render={
        <Button variant="outline" size="sm" className="h-8 border-dashed" aria-label={ariaLabel} />
      }>
        <PlusCircleIcon className="mr-1 h-4 w-4" />
        {label}
        {selected.size > 0 && (
          <>
            <Separator orientation="vertical" className="mx-2 h-4" />
            <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
              {selected.size}
            </Badge>
            <div className="hidden space-x-1 lg:flex">
              {selected.size > 2 ? (
                <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                  {selected.size} selected
                </Badge>
              ) : (
                Array.from(selected).map(v => (
                  <Badge key={v} variant="secondary" className="rounded-sm px-1 font-normal">
                    {getLabel(v)}
                  </Badge>
                ))
              )}
            </div>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`${label}...`} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map(v => (
                <CommandItem
                  key={v}
                  onSelect={() => onToggle(v)}
                  data-checked={selected.has(v) ? 'true' : undefined}
                >
                  {getDot && (
                    <span className={`mr-2 inline-block h-2 w-2 rounded-full shrink-0 ${getDot(v)}`} />
                  )}
                  {getLabel(v)}
                </CommandItem>
              ))}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={onClear}
                    className="justify-center text-center"
                  >
                    {clearLabel}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---- Column definitions -----------------------------------------------------

function getAuditColumns(t: (key: string) => string): ColumnDef<AuditEventSummary>[] {
  return [
  {
    accessorKey: 'timestamp',
    header: t('timestampUtc'),
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
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set());

  const [showSettings, setShowSettings] = useState(false);
  const [auditConfig, setAuditConfig] = useState<AuditConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const auditColumns = useMemo(() => getAuditColumns(t), [t]);

  const loadEvents = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params: { category?: AuditCategory; from?: string; to?: string } = {};
      if (selectedTab !== 'all') params.category = selectedTab;
      if (dateFrom) params.from = new Date(dateFrom).toISOString();
      if (dateTo) {
        const d = new Date(dateTo);
        d.setDate(d.getDate() + 1);
        params.to = d.toISOString();
      }
      const result = await api.getAuditEvents(params, token);
      setEvents(result.events);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit events');
    } finally {
      setLoading(false);
    }
  }, [token, selectedTab, dateFrom, dateTo]);

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

  useEffect(() => {
    if (!token || loaded) return;
    loadEvents();
    loadConfig();
  }, [token, loaded, loadEvents, loadConfig]);

  // Re-fetch events when tab or date range changes
  useEffect(() => {
    if (!token || !loaded) return;
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, dateFrom, dateTo]);

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

  function toggle<T>(set: Set<T>, setSet: (s: Set<T>) => void, value: T) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
  }

  const uniqueActions = useMemo(
    () => [...new Set(events.map(e => e.action))].sort(),
    [events],
  );

  const uniqueUsernames = useMemo(
    () => [...new Set(events.map(e => e.username).filter((u): u is string => !!u))].sort(),
    [events],
  );

  const hasFilters = selectedActions.size > 0 || selectedUsernames.size > 0;

  const displayedEvents = useMemo(() => {
    return events.filter(ev => {
      if (selectedActions.size > 0 && !selectedActions.has(ev.action)) return false;
      if (selectedUsernames.size > 0 && !selectedUsernames.has(ev.username ?? '')) return false;
      return true;
    });
  }, [events, selectedActions, selectedUsernames]);

  function clearFilters() {
    setSelectedActions(new Set());
    setSelectedUsernames(new Set());
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
            onClick={() => { setLoaded(false); }}
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
              onClick={() => { setSelectedTab(cat); setLoaded(false); }}
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
          <FacetedFilter
            label={t('action')}
            ariaLabel={t('action')}
            options={uniqueActions}
            getLabel={formatAction}
            selected={selectedActions}
            onToggle={v => toggle(selectedActions, setSelectedActions, v)}
            onClear={() => setSelectedActions(new Set())}
            clearLabel={t('common:clearFilters')}
          />

          <FacetedFilter
            label={t('user')}
            ariaLabel={t('filterByUsername')}
            options={uniqueUsernames}
            getLabel={v => v}
            selected={selectedUsernames}
            onToggle={v => toggle(selectedUsernames, setSelectedUsernames, v)}
            onClear={() => setSelectedUsernames(new Set())}
            clearLabel={t('common:clearFilters')}
          />

          <DateRangeFilter
            label={t('date')}
            ariaLabel={t('filterByDate')}
            from={dateFrom}
            to={dateTo}
            onFrom={v => { setDateFrom(v); setLoaded(false); }}
            onTo={v => { setDateTo(v); setLoaded(false); }}
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
            data={displayedEvents}
            loading={loading && !loaded}
            loadingLabel={t('loadingAuditEvents')}
            emptyMessage={hasFilters ? t('noEventsMatchCurrentFilters') : t('noAuditEventsYet')}
            defaultSorting={[{ id: 'timestamp', desc: true }]}
          />
        )}

        {/* Footer count */}
        {loaded && events.length > 0 && (
          <div className="text-sm text-muted-foreground">
            {hasFilters
              ? t('common:showing', { count: displayedEvents.length, total: events.length, label: events.length === 1 ? t('common:event') : t('common:events') })
              : t('common:countLabel', { count: events.length, label: events.length === 1 ? t('common:event') : t('common:events') })}
          </div>
        )}
      </div>
    </div>
  );
}
