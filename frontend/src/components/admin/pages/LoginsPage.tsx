import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LoginEventSummary } from '@passvault/shared';
import { ArrowPathIcon, InboxIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';
import { SortButton } from '../SortButton.js';

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

type SortColumn = 'success' | 'username' | 'timestamp' | 'duration';
type SortDir = 'asc' | 'desc';
type DurationBucket = 'all' | 'none' | 'lt1' | '1to5' | '5to15' | '15to60' | 'gt60';

interface FilterState {
  status: 'all' | 'true' | 'false';
  username: string;
  dateFrom: string;
  dateTo: string;
  duration: DurationBucket;
}

const DEFAULT_FILTERS: FilterState = {
  status: 'all',
  username: '',
  dateFrom: '',
  dateTo: '',
  duration: 'all',
};

// ---- Filter logic -----------------------------------------------------------

function matchesDuration(seconds: number | null, bucket: DurationBucket): boolean {
  if (bucket === 'all') return true;
  if (bucket === 'none') return seconds === null;
  if (seconds === null) return false;
  if (bucket === 'lt1') return seconds < 60;
  if (bucket === '1to5') return seconds >= 60 && seconds < 300;
  if (bucket === '5to15') return seconds >= 300 && seconds < 900;
  if (bucket === '15to60') return seconds >= 900 && seconds < 3600;
  return seconds >= 3600; // gt60
}

function applyFilters(events: LoginEventSummary[], f: FilterState): LoginEventSummary[] {
  return events.filter((ev) => {
    if (f.status !== 'all' && String(ev.success) !== f.status) return false;
    if (f.username && ev.username !== f.username) return false;
    if (f.dateFrom) {
      const evDate = ev.timestamp.slice(0, 10);
      if (evDate < f.dateFrom) return false;
    }
    if (f.dateTo) {
      const evDate = ev.timestamp.slice(0, 10);
      if (evDate > f.dateTo) return false;
    }
    const secs = getDurationSeconds(ev);
    if (!matchesDuration(secs, f.duration)) return false;
    return true;
  });
}

function applySort(
  events: LoginEventSummary[],
  col: SortColumn,
  dir: SortDir,
): LoginEventSummary[] {
  const sorted = [...events].sort((a, b) => {
    let cmp = 0;
    if (col === 'success') {
      cmp = (a.success === b.success ? 0 : a.success ? 1 : -1);
    } else if (col === 'username') {
      cmp = a.username.localeCompare(b.username);
    } else if (col === 'timestamp') {
      cmp = a.timestamp.localeCompare(b.timestamp);
    } else {
      const sa = getDurationSeconds(a);
      const sb = getDurationSeconds(b);
      if (sa === null && sb === null) cmp = 0;
      else if (sa === null) cmp = 1;
      else if (sb === null) cmp = -1;
      else cmp = sa - sb;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

// ---- Sub-components ---------------------------------------------------------

function SuccessBadge({ success }: { success: boolean }) {
  if (success) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-success/15 text-success" title="Success">
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-success" />
        Success
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-error/15 text-error" title="Failed">
      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-error" />
      Failed
    </span>
  );
}

const SKELETON_ROWS = 5;

// ---- Main component ---------------------------------------------------------

export function LoginsPage() {
  const { token } = useAuth();
  const admin = useAdmin(token);
  const [events, setEvents] = useState<LoginEventSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sortCol, setSortCol] = useState<SortColumn>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const load = useCallback(async () => {
    const res = await admin.getLoginEvents();
    setEvents(res.events);
    setLoaded(true);
  }, [admin.getLoginEvents]);

  useEffect(() => {
    if (!token || loaded) return;
    load();
  }, [token, loaded, load]);

  const handleSort = (col: SortColumn) => {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const setFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const uniqueUsernames = useMemo(
    () => [...new Set(events.map((e) => e.username))].sort(),
    [events],
  );

  const displayedEvents = useMemo(() => {
    const filtered = applyFilters(events, filters);
    return applySort(filtered, sortCol, sortDir);
  }, [events, filters, sortCol, sortDir]);

  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.username !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.duration !== 'all';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Logins</h1>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setLoaded(false)}
          disabled={admin.loading}
          title="Refresh"
          aria-label="Refresh"
        >
          <ArrowPathIcon className="w-4 h-4" />
        </button>
      </div>

      {admin.error && <p className="text-error text-sm mb-4">{admin.error}</p>}

      {/* Filter bar — only shown once data is loaded */}
      {loaded && events.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-base-100 rounded-xl border border-base-300">
          <FunnelIcon className="w-4 h-4 text-base-content/40 self-end mb-1.5 shrink-0" />

          {/* Status */}
          <label className="flex flex-col gap-1 text-xs text-base-content/50">
            Status
            <select
              className="select select-sm select-bordered w-32"
              value={filters.status}
              onChange={(e) => setFilter('status', e.target.value as FilterState['status'])}
              aria-label="Filter by status"
            >
              <option value="all">All</option>
              <option value="true">Success</option>
              <option value="false">Failed</option>
            </select>
          </label>

          {/* Username */}
          <label className="flex flex-col gap-1 text-xs text-base-content/50">
            Username
            <select
              className="select select-sm select-bordered w-36"
              value={filters.username}
              onChange={(e) => setFilter('username', e.target.value)}
              aria-label="Filter by username"
            >
              <option value="">All users</option>
              {uniqueUsernames.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </label>

          {/* Date From */}
          <label className="flex flex-col gap-1 text-xs text-base-content/50">
            From date
            <input
              type="date"
              className="input input-sm input-bordered w-36"
              value={filters.dateFrom}
              onChange={(e) => setFilter('dateFrom', e.target.value)}
              aria-label="Filter from date"
            />
          </label>

          {/* Date To */}
          <label className="flex flex-col gap-1 text-xs text-base-content/50">
            To date
            <input
              type="date"
              className="input input-sm input-bordered w-36"
              value={filters.dateTo}
              onChange={(e) => setFilter('dateTo', e.target.value)}
              aria-label="Filter to date"
            />
          </label>

          {/* Duration */}
          <label className="flex flex-col gap-1 text-xs text-base-content/50">
            Duration
            <select
              className="select select-sm select-bordered w-44"
              value={filters.duration}
              onChange={(e) => setFilter('duration', e.target.value as DurationBucket)}
              aria-label="Filter by duration"
            >
              <option value="all">All durations</option>
              <option value="none">No duration recorded</option>
              <option value="lt1">{'< 1 min'}</option>
              <option value="1to5">1 – 5 min</option>
              <option value="5to15">5 – 15 min</option>
              <option value="15to60">15 – 60 min</option>
              <option value="gt60">{'> 60 min'}</option>
            </select>
          </label>

          {/* Clear */}
          {hasActiveFilters && (
            <button
              className="btn btn-ghost btn-sm self-end"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="bg-base-100 rounded-xl border border-base-300 overflow-hidden">
        {admin.loading && !loaded ? (
          <>
            <span className="sr-only">Loading login events…</span>
            <table className="table table-fixed w-full">
              <thead className="sticky top-0 z-10 bg-base-100 border-b border-base-300">
                <tr className="text-xs font-semibold uppercase tracking-wider text-base-content/40">
                  <th className="py-3 px-4 w-28">Success</th>
                  <th className="py-3 px-4 w-36">Username</th>
                  <th className="py-3 px-4">Login Time (UTC)</th>
                  <th className="py-3 px-4 w-28">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-300">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[0, 1, 2, 3].map((j) => (
                      <td key={j} className="py-3 px-4">
                        <div className="h-4 bg-base-300 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-base-content/40">
            <InboxIcon className="w-10 h-10 mb-3" />
            <p className="font-medium">No login events yet</p>
            <p className="text-sm mt-1">Events will appear here after users log in.</p>
          </div>
        ) : displayedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-base-content/40">
            <FunnelIcon className="w-10 h-10 mb-3" />
            <p className="font-medium">No events match the current filters</p>
            <p className="text-sm mt-1">Try adjusting or clearing the filters above.</p>
          </div>
        ) : (
          <table className="table table-fixed w-full">
            <thead className="sticky top-0 z-10 bg-base-100 border-b border-base-300">
              <tr className="text-xs font-semibold uppercase tracking-wider text-base-content/40">
                <th className="py-3 px-4 w-28">
                  <SortButton label="Success" active={sortCol === 'success'} direction={sortDir} onClick={() => handleSort('success')} />
                </th>
                <th className="py-3 px-4 w-36">
                  <SortButton label="Username" active={sortCol === 'username'} direction={sortDir} onClick={() => handleSort('username')} />
                </th>
                <th className="py-3 px-4">
                  <SortButton label="Login Time (UTC)" active={sortCol === 'timestamp'} direction={sortDir} onClick={() => handleSort('timestamp')} />
                </th>
                <th className="py-3 px-4 w-28">
                  <SortButton label="Duration" active={sortCol === 'duration'} direction={sortDir} onClick={() => handleSort('duration')} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-300">
              {displayedEvents.map((ev) => (
                <tr key={ev.eventId} className="hover:bg-base-200/50">
                  <td className="py-3 px-4">
                    <SuccessBadge success={ev.success} />
                  </td>
                  <td className="py-3 px-4 font-mono text-sm">{ev.username}</td>
                  <td className="py-3 px-4 text-sm text-base-content/70 tabular-nums">
                    {formatTimestamp(ev.timestamp)}
                  </td>
                  <td className="py-3 px-4 text-sm tabular-nums">
                    {formatDuration(getDurationSeconds(ev))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {loaded && events.length > 0 && (
        <div className="mt-2 text-xs text-base-content/40 text-right">
          {hasActiveFilters
            ? `Showing ${displayedEvents.length} of ${events.length} events`
            : `${events.length} ${events.length === 1 ? 'event' : 'events'}`}
        </div>
      )}
    </div>
  );
}
