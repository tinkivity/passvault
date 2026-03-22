import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { UserSummary, UserStatus } from '@passvault/shared';
import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';
import { OtpDisplay } from '../OtpDisplay.js';

const statusLabel: Record<UserStatus, string> = {
  pending_first_login: 'Awaiting first login',
  pending_passkey_setup: 'Awaiting passkey setup',
  active: 'Active',
};

const statusClass: Record<UserStatus, string> = {
  pending_first_login: 'badge badge-warning',
  pending_passkey_setup: 'badge badge-info',
  active: 'badge badge-success',
};

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return 'Empty';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useAuth();
  const admin = useAdmin(token);
  const [refreshedOtp, setRefreshedOtp] = useState<{ username: string; oneTimePassword: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const user = (location.state as { user?: UserSummary } | null)?.user;

  const handleBack = () => navigate('/admin/users');

  if (!user) {
    return (
      <div>
        <button className="btn btn-ghost btn-sm mb-4" onClick={handleBack}>
          ← Users
        </button>
        <p className="text-base-content/50 text-sm">
          User not found.{' '}
          <button className="link" onClick={handleBack}>
            Return to users list
          </button>
          .
        </p>
      </div>
    );
  }

  if (refreshedOtp) {
    return (
      <div>
        <button className="btn btn-ghost btn-sm mb-4" onClick={handleBack}>
          ← Users
        </button>
        <OtpDisplay
          username={refreshedOtp.username}
          oneTimePassword={refreshedOtp.oneTimePassword}
          onDone={() => setRefreshedOtp(null)}
        />
      </div>
    );
  }

  const handleRefreshOtp = async () => {
    const result = await admin.refreshOtp(user.userId);
    setRefreshedOtp(result);
  };

  const handleDelete = async () => {
    await admin.deleteUser(user.userId);
    navigate('/admin/users', { replace: true });
  };

  return (
    <div className="max-w-xl">
      <button className="btn btn-ghost btn-sm mb-6" onClick={handleBack}>
        ← Users
      </button>

      <div className="bg-base-100 rounded-xl shadow-sm p-6">
        <div className="flex items-start gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold font-mono">{user.username}</h1>
            <span className={statusClass[user.status]}>
              {statusLabel[user.status]}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm mb-6">
          <dt className="text-base-content/50">Email</dt>
          <dd>{user.email ?? '—'}</dd>
          <dt className="text-base-content/50">Created</dt>
          <dd>{new Date(user.createdAt).toISOString().slice(0, 10)}</dd>
          <dt className="text-base-content/50">Last Login</dt>
          <dd>
            {user.lastLoginAt
              ? new Date(user.lastLoginAt).toISOString().slice(0, 10)
              : '—'}
          </dd>
          <dt className="text-base-content/50">Vault Size</dt>
          <dd>{formatBytes(user.vaultSizeBytes)}</dd>
          <dt className="text-base-content/50">User ID</dt>
          <dd className="font-mono text-xs text-base-content/50 break-all">{user.userId}</dd>
        </dl>

        {admin.error && <p className="text-error text-sm mb-4">{admin.error}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => admin.downloadUserVault(user.userId, user.username)}
            disabled={admin.loading}
          >
            Download Vault
          </button>

          {user.status === 'pending_first_login' && (
            <>
              <button
                className="btn btn-sm btn-ghost"
                onClick={handleRefreshOtp}
                disabled={admin.loading}
              >
                Refresh OTP
              </button>

              {deleteConfirm ? (
                <>
                  <button
                    className="btn btn-sm btn-error"
                    onClick={handleDelete}
                    disabled={admin.loading}
                  >
                    Confirm Delete
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setDeleteConfirm(false)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-sm btn-ghost text-error"
                  onClick={() => setDeleteConfirm(true)}
                >
                  Delete User
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
