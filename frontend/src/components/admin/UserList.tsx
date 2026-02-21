import type { UserSummary, UserStatus } from '@passvault/shared';
import { Button } from '../layout/Layout.js';

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
  pending_first_login: 'bg-yellow-100 text-yellow-800',
  pending_totp_setup: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
};

export function UserList({ users, loading, onDownload }: UserListProps) {
  if (loading) {
    return <p className="text-sm text-gray-400">Loading users…</p>;
  }

  if (users.length === 0) {
    return <p className="text-sm text-gray-500 italic">No users yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
            <th className="pb-2 font-medium pr-4">Username</th>
            <th className="pb-2 font-medium pr-4">Status</th>
            <th className="pb-2 font-medium pr-4">Created</th>
            <th className="pb-2 font-medium pr-4">Last login</th>
            <th className="pb-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.userId} className="border-b border-gray-100 last:border-0">
              <td className="py-2 pr-4 font-mono text-gray-800">{user.username}</td>
              <td className="py-2 pr-4">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusClass[user.status]}`}>
                  {statusLabel[user.status]}
                </span>
              </td>
              <td className="py-2 pr-4 text-gray-500">
                {new Date(user.createdAt).toISOString().slice(0, 10)}
              </td>
              <td className="py-2 pr-4 text-gray-500">
                {user.lastLoginAt ? new Date(user.lastLoginAt).toISOString().slice(0, 10) : '—'}
              </td>
              <td className="py-2">
                <Button
                  variant="secondary"
                  onClick={() => onDownload(user.userId, user.username)}
                >
                  Download ({formatBytes(user.vaultSizeBytes)})
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
