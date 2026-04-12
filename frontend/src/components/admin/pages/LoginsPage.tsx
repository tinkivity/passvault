import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef, SortingFn } from '@tanstack/react-table';
import type { LoginEventSummary } from '@passvault/shared';
import { ArrowPathIcon, InboxIcon, PlusCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';
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

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 19);
  return `${date} ${time}`;
}

export function getDurationSeconds(ev: LoginEventSummary): number | null {
  if (!ev.logoutAt) return null;
  const s = Math.round(
    (new Date(ev.logoutAt).getTime() - new Date(ev.timestamp).getTime()) / 1000,
  );
  return s < 0 ? null : s;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
  const ss = (seconds % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

// ---- Types ------------------------------------------------------------------

type SuccessFilter = 'true' | 'false';
type DurationBucket = 'none' | 'lt1' | '1to5' | '5to15' | '15to60' | 'gt60';

const ALL_SUCCESS: SuccessFilter[] = ['true', 'false'];
const ALL_DURATIONS: DurationBucket[] = ['none', 'lt1', '1to5', '5to15', '15to60', 'gt60'];

const successLabel: Record<SuccessFilter, string> = {
  true: 'Success',
  false: 'Failed',
};
const successDot: Record<SuccessFilter, string> = {
  true: 'bg-green-600',
  false: 'bg-destructive',
};

const durationLabel: Record<DurationBucket, string> = {
  none: 'No duration',
  lt1: '< 1 min',
  '1to5': '1–5 min',
  '5to15': '5–15 min',
  '15to60': '15–60 min',
  gt60: '> 60 min',
};

// ---- Filter logic -----------------------------------------------------------

function matchesDuration(seconds: number | null, bucket: DurationBucket): boolean {
  if (bucket === 'none') return seconds === null;
  if (seconds === null) return false;
  if (bucket === 'lt1') return seconds < 60;
  if (bucket === '1to5') return seconds >= 60 && seconds < 300;
  if (bucket === '5to15') return seconds >= 300 && seconds < 900;
  if (bucket === '15to60') return seconds >= 900 && seconds < 3600;
  return seconds >= 3600;
}

function applyFilters(
  events: LoginEventSummary[],
  statuses: Set<SuccessFilter>,
  usernames: Set<string>,
  dateFrom: string,
  dateTo: string,
  durations: Set<DurationBucket>,
): LoginEventSummary[] {
  return events.filter((ev) => {
    if (statuses.size > 0 && !statuses.has(String(ev.success) as SuccessFilter)) return false;
    if (usernames.size > 0 && !usernames.has(ev.username)) return false;
    const evDate = ev.timestamp.slice(0, 10);
    if (dateFrom && evDate < dateFrom) return false;
    if (dateTo && evDate > dateTo) return false;
    if (durations.size > 0) {
      const secs = getDurationSeconds(ev);
      if (!Array.from(durations).some(d => matchesDuration(secs, d))) return false;
    }
    return true;
  });
}

// ---- Sub-components ---------------------------------------------------------

function SuccessBadge({ success }: { success: boolean }) {
  if (success) {
    return (
      <span title="Success" className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-green-600/15 text-green-600">
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-green-600" />
        Success
      </span>
    );
  }
  return (
    <span title="Failed" className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-destructive" />
      Failed
    </span>
  );
}

function FacetedFilter<T extends string>({
  label,
  ariaLabel,
  options,
  getLabel,
  getDot,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  ariaLabel: string;
  options: T[];
  getLabel: (v: T) => string;
  getDot?: (v: T) => string;
  selected: Set<T>;
  onToggle: (v: T) => void;
  onClear: () => void;
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
                    Clear filters
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

// Null-last sort for duration
const durationSortFn: SortingFn<LoginEventSummary> = (rowA, rowB) => {
  const a = getDurationSeconds(rowA.original);
  const b = getDurationSeconds(rowB.original);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
};

const loginColumns: ColumnDef<LoginEventSummary>[] = [
  {
    accessorKey: 'success',
    header: 'Success',
    size: 112,
    sortDescFirst: false,
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.success;
      const b = rowB.original.success;
      return a === b ? 0 : a ? 1 : -1;
    },
    cell: ({ row }) => <SuccessBadge success={row.original.success} />,
  },
  {
    accessorKey: 'username',
    header: 'Username',
    size: 144,
    cell: ({ row }) => <span className="font-mono">{row.original.username}</span>,
  },
  {
    id: 'passkey',
    header: 'Passkey',
    size: 144,
    accessorFn: row => row.passkeyName ?? '',
    cell: ({ row }) => row.original.passkeyName
      ? <span>{row.original.passkeyName}</span>
      : <span className="text-muted-foreground">password</span>,
  },
  {
    accessorKey: 'timestamp',
    header: 'Login time (UTC)',
    cell: ({ row }) => (
      <span className="text-muted-foreground tabular-nums">
        {formatTimestamp(row.original.timestamp)}
      </span>
    ),
  },
  {
    id: 'duration',
    header: 'Duration',
    size: 112,
    sortDescFirst: false,
    accessorFn: row => getDurationSeconds(row),
    sortingFn: durationSortFn,
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatDuration(getDurationSeconds(row.original))}
      </span>
    ),
  },
];

// ---- Main component ---------------------------------------------------------

export function LoginsPage() {
  const { token } = useAuth();
  const admin = useAdmin(token);
  const [events, setEvents] = useState<LoginEventSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [selectedStatuses, setSelectedStatuses] = useState<Set<SuccessFilter>>(new Set());
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedDurations, setSelectedDurations] = useState<Set<DurationBucket>>(new Set());

  const load = useCallback(async () => {
    const res = await admin.getLoginEvents();
    setEvents(res.events);
    setLoaded(true);
  }, [admin.getLoginEvents]);

  useEffect(() => {
    if (!token || loaded) return;
    load();
  }, [token, loaded, load]);

  function toggle<T>(set: Set<T>, setSet: (s: Set<T>) => void, value: T) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
  }

  function clearFilters() {
    setSelectedStatuses(new Set());
    setSelectedUsernames(new Set());
    setDateFrom('');
    setDateTo('');
    setSelectedDurations(new Set());
  }

  const uniqueUsernames = useMemo(
    () => [...new Set(events.map(e => e.username))].sort(),
    [events],
  );

  const hasFilters =
    selectedStatuses.size > 0 || selectedUsernames.size > 0 ||
    dateFrom !== '' || dateTo !== '' || selectedDurations.size > 0;

  const displayedEvents = useMemo(
    () => applyFilters(events, selectedStatuses, selectedUsernames, dateFrom, dateTo, selectedDurations),
    [events, selectedStatuses, selectedUsernames, dateFrom, dateTo, selectedDurations],
  );

  const isLoading = admin.loading && !loaded;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Logins</h1>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setLoaded(false)}
          disabled={admin.loading}
          title="Refresh"
          aria-label="Refresh"
        >
          <ArrowPathIcon className="w-4 h-4" />
        </Button>
      </div>

      {admin.error && <p className="text-destructive text-sm mb-4">{admin.error}</p>}

      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <FacetedFilter
            label="Status"
            ariaLabel="Filter by status"
            options={ALL_SUCCESS}
            getLabel={v => successLabel[v]}
            getDot={v => successDot[v]}
            selected={selectedStatuses}
            onToggle={v => toggle(selectedStatuses, setSelectedStatuses, v)}
            onClear={() => setSelectedStatuses(new Set())}
          />

          <FacetedFilter
            label="User"
            ariaLabel="Filter by username"
            options={uniqueUsernames}
            getLabel={v => v}
            selected={selectedUsernames}
            onToggle={v => toggle(selectedUsernames, setSelectedUsernames, v)}
            onClear={() => setSelectedUsernames(new Set())}
          />

          <DateRangeFilter
            label="Date"
            ariaLabel="Filter by login date"
            from={dateFrom}
            to={dateTo}
            onFrom={setDateFrom}
            onTo={setDateTo}
          />

          <FacetedFilter
            label="Duration"
            ariaLabel="Filter by duration"
            options={ALL_DURATIONS}
            getLabel={v => durationLabel[v]}
            selected={selectedDurations}
            onToggle={v => toggle(selectedDurations, setSelectedDurations, v)}
            onClear={() => setSelectedDurations(new Set())}
          />

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 lg:px-3"
              onClick={clearFilters}
            >
              Reset
              <XMarkIcon className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Table or empty state */}
        {!loaded && !admin.loading ? null : loaded && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <InboxIcon className="w-10 h-10 mb-3" />
            <p className="font-medium">No login events yet</p>
            <p className="text-sm mt-1">Events will appear here after users log in.</p>
          </div>
        ) : (
          <DataTable
            columns={loginColumns}
            data={displayedEvents}
            loading={isLoading}
            loadingLabel="Loading login events…"
            emptyMessage={hasFilters ? 'No events match the current filters' : 'No login events yet'}
            defaultSorting={[{ id: 'timestamp', desc: true }]}
          />
        )}
      </div>
    </div>
  );
}
