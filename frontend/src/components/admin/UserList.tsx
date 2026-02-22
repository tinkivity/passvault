import type { UserSummary, UserStatus } from '@passvault/shared';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

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

export function UserList({ users, loading, onDownload }: UserListProps) {
  if (loading) {
    return <p className="text-sm text-base-content/40">Loading users…</p>;
  }

  if (users.length === 0) {
    return <p className="text-sm text-base-content/50 italic">No users yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm w-full">
        <thead>
          <tr>
            <th>Username</th>
            <th>Status</th>
            <th>Created</th>
            <th>Last login</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
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
