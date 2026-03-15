import { useState } from 'react';
import type { UserSummary, UserStatus } from '@passvault/shared';
import {
  ArrowDownTrayIcon,
  ChevronUpDownIcon,
  ChevronDoubleUpIcon,
  ChevronDoubleDownIcon,
  ArrowPathIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
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
}

const statusLabel: Record<UserStatus, string> = {
  pending_first_login: 'Awaiting first login',
  pending_passkey_setup: 'Awaiting passkey setup',
  active: 'Active',
};

const statusClass: Record<UserStatus, string> = {
  pending_first_login: 'badge badge-warning badge-sm whitespace-nowrap',
  pending_passkey_setup: 'badge badge-info badge-sm whitespace-nowrap',
  active: 'badge badge-success badge-sm whitespace-nowrap',
};

type SortColumn = 'username' | 'status' | 'createdAt' | 'lastLoginAt';
type SortDirection = 'asc' | 'desc';

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
      else if (!a.lastLoginAt) cmp = 1;   // nulls last
      else if (!b.lastLoginAt) cmp = -1;
      else cmp = a.lastLoginAt.localeCompare(b.lastLoginAt);
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDirection }) {
  if (!active) return <ChevronUpDownIcon className="w-4 h-4 shrink-0" />;
  return dir === 'asc'
    ? <ChevronDoubleUpIcon className="w-4 h-4 shrink-0" />
    : <ChevronDoubleDownIcon className="w-4 h-4 shrink-0" />;
}

export function UserList({ users, loading, onDownload, onRefreshOtp, onDeleteUser }: UserListProps) {
  const [sortCol, setSortCol] = useState<SortColumn>('username');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
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

  function thButton(col: SortColumn, label: string) {
    return (
      <th key={col}>
        <button
          onClick={() => handleSort(col)}
          className="flex items-center gap-1 cursor-pointer select-none"
        >
          <SortIcon active={sortCol === col} dir={sortDir} />
          {label}
        </button>
      </th>
    );
  }

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

  if (loading) {
    return <p className="text-sm text-base-content/40">Loading users…</p>;
  }

  if (users.length === 0) {
    return <p className="text-sm text-base-content/50 italic">No users yet.</p>;
  }

  const sorted = applySorting(users, sortCol, sortDir);

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm w-full">
        <thead>
          <tr>
            {thButton('username', 'Username')}
            {thButton('status', 'Status')}
            {isEmailEnv && <th>Email</th>}
            {thButton('createdAt', 'Created')}
            {thButton('lastLoginAt', 'Last login')}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(user => (
            <tr key={user.userId}>
              <td className="font-mono">{user.username}</td>
              <td>
                <span className={statusClass[user.status]}>
                  {statusLabel[user.status]}
                </span>
              </td>
              {isEmailEnv && (
                <td className="text-base-content/50 text-xs">
                  {user.email ?? '—'}
                </td>
              )}
              <td className="text-base-content/50">
                {new Date(user.createdAt).toISOString().slice(0, 10)}
              </td>
              <td className="text-base-content/50">
                {user.lastLoginAt ? new Date(user.lastLoginAt).toISOString().slice(0, 10) : '—'}
              </td>
              <td className="flex gap-1">
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
    </div>
  );
}
