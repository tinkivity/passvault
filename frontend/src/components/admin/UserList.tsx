import { useState } from 'react';
import type { UserSummary, UserStatus } from '@passvault/shared';
import {
  ArrowDownTrayIcon,
  ChevronUpDownIcon,
  ChevronDoubleUpIcon,
  ChevronDoubleDownIcon,
} from '@heroicons/react/24/outline';

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
}

const statusLabel: Record<UserStatus, string> = {
  pending_first_login: 'Awaiting first login',
  pending_totp_setup: 'Awaiting TOTP setup',
  active: 'Active',
};

const statusClass: Record<UserStatus, string> = {
  pending_first_login: 'badge badge-warning badge-sm',
  pending_totp_setup: 'badge badge-info badge-sm',
  active: 'badge badge-success badge-sm',
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

export function UserList({ users, loading, onDownload }: UserListProps) {
  const [sortCol, setSortCol] = useState<SortColumn>('username');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

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
              <td className="text-base-content/50">
                {new Date(user.createdAt).toISOString().slice(0, 10)}
              </td>
              <td className="text-base-content/50">
                {user.lastLoginAt ? new Date(user.lastLoginAt).toISOString().slice(0, 10) : '—'}
              </td>
              <td>
                <button
                  onClick={() => onDownload(user.userId, user.username)}
                  className="btn btn-ghost btn-sm"
                  title={`Download ${user.username}'s vault (${formatBytes(user.vaultSizeBytes)})`}
                  aria-label={`Download ${user.username}'s vault`}
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
