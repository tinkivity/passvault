import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LoginEventSummary } from '@passvault/shared';
import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';

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

function SuccessIcon({ success }: { success: boolean }) {
  if (success) {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-success/15 text-success font-bold"
        title="Success"
      >
        ✓
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-error/15 text-error font-bold"
      title="Failed"
    >
      ✗
    </span>
  );
}

function SortIndicator({ col, active, dir }: { col: SortColumn; active: SortColumn; dir: SortDir }) {
  if (col !== active) return <span className="ml-1 text-base-content/20">↕</span>;
  return <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

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

  const thBtn = (col: SortColumn, label: string) => (
    <button
      className="flex items-center gap-0.5 font-semibold hover:text-base-content transition-colors"
      onClick={() => handleSort(col)}
      aria-label={label}
    >
      {label}
      <SortIndicator col={col} active={sortCol} dir={sortDir} />
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Logins</h1>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setLoaded(false)}
          disabled={admin.loading}
          title="Refresh"
        >
          ↺
        </button>
      </div>

      {admin.error && <p className="text-error text-sm mb-4">{admin.error}</p>}

      {/* Filter bar — only shown once data is loaded */}
      {loaded && events.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-base-100 rounded-xl shadow-sm">
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
              <option value="true">✓ Success</option>
              <option value="false">✗ Failed</option>
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

      <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
        {admin.loading && !loaded ? (
          <p className="text-center text-base-content/50 py-8 text-sm">Loading login events…</p>
        ) : events.length === 0 ? (
          <p className="text-center text-base-content/50 py-8 text-sm">No login events yet.</p>
        ) : displayedEvents.length === 0 ? (
          <p className="text-center text-base-content/50 py-8 text-sm">No events match the current filters.</p>
        ) : (
          <table className="table table-sm w-full">
            <thead>
              <tr className="text-xs text-base-content/50 uppercase tracking-wide">
                <th className="w-10 text-center">{thBtn('success', 'Success')}</th>
                <th>{thBtn('username', 'Username')}</th>
                <th>{thBtn('timestamp', 'Login Time (UTC)')}</th>
                <th>{thBtn('duration', 'Duration')}</th>
              </tr>
            </thead>
            <tbody>
              {displayedEvents.map((ev) => (
                <tr key={ev.eventId} className="hover:bg-base-200/50">
                  <td className="text-center">
                    <SuccessIcon success={ev.success} />
                  </td>
                  <td className="font-mono text-sm">{ev.username}</td>
                  <td className="text-sm text-base-content/70 tabular-nums">
                    {formatTimestamp(ev.timestamp)}
                  </td>
                  <td className="text-sm tabular-nums">
                    {formatDuration(getDurationSeconds(ev))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {loaded && hasActiveFilters && (
        <p className="text-xs text-base-content/40 mt-2 text-right">
          Showing {displayedEvents.length} of {events.length} events
        </p>
      )}
    </div>
  );
}
