import { useState } from 'react';
import type { UserSummary, UserStatus } from '@passvault/shared';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  TrashIcon,
  InboxIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { SortButton } from './SortButton.js';
import { OtpDisplay } from './OtpDisplay.js';

const isEmailEnv = import.meta.env.VITE_ENVIRONMENT !== 'dev';

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return 'empty';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UserListProps {
  users: UserSummary[];
  loading: boolean;
  onDownload: (userId: string, username: string) => void;
  onRefreshOtp: (userId: string) => Promise<{ username: string; oneTimePassword: string }>;
  onDeleteUser: (userId: string) => Promise<void>;
  onRowClick?: (user: UserSummary) => void;
}

const statusLabel: Record<UserStatus, string> = {
  pending_first_login: 'Awaiting first login',
  pending_passkey_setup: 'Awaiting passkey setup',
  active: 'Active',
};

const statusDot: Record<UserStatus, string> = {
  pending_first_login: 'bg-warning',
  pending_passkey_setup: 'bg-info',
  active: 'bg-success',
};

const statusPill: Record<UserStatus, string> = {
  pending_first_login: 'bg-warning/15 text-warning',
  pending_passkey_setup: 'bg-info/15 text-info',
  active: 'bg-success/15 text-success',
};

type SortColumn = 'username' | 'status' | 'createdAt' | 'lastLoginAt';
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'all' | UserStatus;

interface FilterState {
  status: StatusFilter;
  username: string;
}

const DEFAULT_FILTERS: FilterState = { status: 'all', username: '' };

function applyFilters(users: UserSummary[], f: FilterState): UserSummary[] {
  return users.filter((u) => {
    if (f.status !== 'all' && u.status !== f.status) return false;
    if (f.username && !u.username.toLowerCase().includes(f.username.toLowerCase())) return false;
    return true;
  });
}

function applySorting(users: UserSummary[], col: SortColumn, dir: SortDirection): UserSummary[] {
  return [...users].sort((a, b) => {
    let cmp = 0;
    if (col === 'username') {
      cmp = a.username.localeCompare(b.username);
    } else if (col === 'status') {
      cmp = statusLabel[a.status].localeCompare(statusLabel[b.status]);
    } else if (col === 'createdAt') {
      cmp = a.createdAt.localeCompare(b.createdAt);
    } else if (col === 'lastLoginAt') {
      if (!a.lastLoginAt && !b.lastLoginAt) cmp = 0;
      else if (!a.lastLoginAt) cmp = 1;
      else if (!b.lastLoginAt) cmp = -1;
      else cmp = a.lastLoginAt.localeCompare(b.lastLoginAt);
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

const SKELETON_ROWS = 5;

export function UserList({ users, loading, onDownload, onRefreshOtp, onDeleteUser, onRowClick }: UserListProps) {
  const [sortCol, setSortCol] = useState<SortColumn>('username');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [refreshedOtp, setRefreshedOtp] = useState<{ username: string; oneTimePassword: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  function handleSort(col: SortColumn) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  const setFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  async function handleRefreshOtp(userId: string) {
    setActionLoading(userId + ':refresh');
    try {
      const result = await onRefreshOtp(userId);
      setRefreshedOtp(result);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteUser(userId: string) {
    setActionLoading(userId + ':delete');
    try {
      await onDeleteUser(userId);
      setConfirmDelete(null);
    } finally {
      setActionLoading(null);
    }
  }

  if (refreshedOtp) {
    return (
      <OtpDisplay
        username={refreshedOtp.username}
        oneTimePassword={refreshedOtp.oneTimePassword}
        onDone={() => setRefreshedOtp(null)}
      />
    );
  }

  const colCount = isEmailEnv ? 6 : 5;

  if (loading) {
    return (
      <div className="overflow-x-auto">
        <span className="sr-only">Loading users…</span>
        <table className="table table-fixed w-full">
          <thead className="sticky top-0 z-10 bg-base-100 border-b border-base-300">
            <tr className="text-xs font-semibold uppercase tracking-wider text-base-content/40">
              <th className="py-3 px-4 w-36">Username</th>
              <th className="py-3 px-4 w-44">Status</th>
              {isEmailEnv && <th className="py-3 px-4">Email</th>}
              <th className="py-3 px-4 w-28">Created</th>
              <th className="py-3 px-4 w-28">Last login</th>
              <th className="py-3 px-4 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-300">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {Array.from({ length: colCount }).map((__, j) => (
                  <td key={j} className="py-3 px-4">
                    <div className="h-4 bg-base-300 rounded w-3/4" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-base-content/40">
        <InboxIcon className="w-10 h-10 mb-3" />
        <p className="font-medium">No users yet</p>
        <p className="text-sm mt-1">Create the first user to get started.</p>
      </div>
    );
  }

  const hasActiveFilters = filters.status !== 'all' || filters.username !== '';
  const filtered = applyFilters(users, filters);
  const sorted = applySorting(filtered, sortCol, sortDir);

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 p-3 bg-base-100 border-b border-base-300">
        <FunnelIcon className="w-4 h-4 text-base-content/40 self-end mb-1.5 shrink-0" />

        {/* Status */}
        <label className="flex flex-col gap-1 text-xs text-base-content/50">
          Status
          <select
            className="select select-sm select-bordered w-48"
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value as StatusFilter)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending_first_login">Awaiting first login</option>
            <option value="pending_passkey_setup">Awaiting passkey setup</option>
          </select>
        </label>

        {/* Username */}
        <label className="flex flex-col gap-1 text-xs text-base-content/50">
          Username
          <input
            type="text"
            className="input input-sm input-bordered w-40"
            placeholder="Search…"
            value={filters.username}
            onChange={(e) => setFilter('username', e.target.value)}
            aria-label="Filter by username"
          />
        </label>

        {hasActiveFilters && (
          <button
            className="btn btn-ghost btn-sm self-end"
            onClick={() => setFilters(DEFAULT_FILTERS)}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-base-content/40">
            <FunnelIcon className="w-10 h-10 mb-3" />
            <p className="font-medium">No users match the current filters</p>
            <p className="text-sm mt-1">Try adjusting or clearing the filters above.</p>
          </div>
        ) : (
          <table className="table table-fixed w-full">
            <thead className="sticky top-0 z-10 bg-base-100 border-b border-base-300">
              <tr className="text-xs font-semibold uppercase tracking-wider text-base-content/40">
                <th className="py-3 px-4 w-36">
                  <SortButton label="Username" active={sortCol === 'username'} direction={sortDir} onClick={() => handleSort('username')} />
                </th>
                <th className="py-3 px-4 w-44">
                  <SortButton label="Status" active={sortCol === 'status'} direction={sortDir} onClick={() => handleSort('status')} />
                </th>
                {isEmailEnv && <th className="py-3 px-4">Email</th>}
                <th className="py-3 px-4 w-28">
                  <SortButton label="Created" active={sortCol === 'createdAt'} direction={sortDir} onClick={() => handleSort('createdAt')} />
                </th>
                <th className="py-3 px-4 w-28">
                  <SortButton label="Last login" active={sortCol === 'lastLoginAt'} direction={sortDir} onClick={() => handleSort('lastLoginAt')} />
                </th>
                <th className="py-3 px-4 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-300">
              {sorted.map(user => (
                <tr
                  key={user.userId}
                  onClick={() => onRowClick?.(user)}
                  className={`group${onRowClick ? ' cursor-pointer hover:bg-base-200/50' : ''}`}
                >
                  <td className="py-3 px-4 font-mono text-sm">{user.username}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusPill[user.status]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[user.status]}`} />
                      {statusLabel[user.status]}
                    </span>
                  </td>
                  {isEmailEnv && (
                    <td className="py-3 px-4 text-sm text-base-content/50">
                      {user.email ?? '—'}
                    </td>
                  )}
                  <td className="py-3 px-4 text-sm text-base-content/50">
                    {new Date(user.createdAt).toISOString().slice(0, 10)}
                  </td>
                  <td className="py-3 px-4 text-sm text-base-content/50">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toISOString().slice(0, 10) : '—'}
                  </td>
                  <td
                    className={`py-3 px-4 flex gap-1 transition-opacity ${confirmDelete === user.userId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => onDownload(user.userId, user.username)}
                      className="btn btn-ghost btn-sm"
                      title={`Download ${user.username}'s vault (${formatBytes(user.vaultSizeBytes)})`}
                      aria-label={`Download ${user.username}'s vault`}
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                    </button>
                    {user.status === 'pending_first_login' && (
                      <>
                        <button
                          onClick={() => handleRefreshOtp(user.userId)}
                          disabled={actionLoading === user.userId + ':refresh'}
                          className="btn btn-ghost btn-sm"
                          title="Refresh OTP"
                          aria-label={`Refresh OTP for ${user.username}`}
                        >
                          <ArrowPathIcon className="w-4 h-4" />
                        </button>
                        {confirmDelete === user.userId ? (
                          <span className="flex items-center gap-1">
                            <button
                              onClick={() => handleDeleteUser(user.userId)}
                              disabled={actionLoading === user.userId + ':delete'}
                              className="btn btn-error btn-sm"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="btn btn-ghost btn-sm"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(user.userId)}
                            className="btn btn-ghost btn-sm text-error"
                            title="Delete user"
                            aria-label={`Delete ${user.username}`}
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-4 py-2 border-t border-base-300 text-xs text-base-content/40 text-right">
        {hasActiveFilters
          ? `Showing ${sorted.length} of ${users.length} ${users.length === 1 ? 'record' : 'records'}`
          : `${users.length} ${users.length === 1 ? 'record' : 'records'}`}
      </div>
    </div>
  );
}
