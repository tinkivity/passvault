import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { UserSummary, UserStatus } from '@passvault/shared';
import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';
import { OtpDisplay } from '../OtpDisplay.js';
import { Button } from '@/components/ui/button';

const statusLabel: Record<UserStatus, string> = {
  pending_first_login: 'Awaiting first login',
  pending_passkey_setup: 'Awaiting passkey setup',
  active: 'Active',
};

const statusClass: Record<UserStatus, string> = {
  pending_first_login: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-600 border-amber-500/20',
  pending_passkey_setup: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-blue-500/15 text-blue-500 border-blue-500/20',
  active: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-green-600/15 text-green-600 border-green-600/20',
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
        <Button variant="ghost" size="sm" className="mb-4" onClick={handleBack}>
          ← Users
        </Button>
        <p className="text-muted-foreground text-sm">
          User not found.{' '}
          <button className="underline" onClick={handleBack}>
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
        <Button variant="ghost" size="sm" className="mb-4" onClick={handleBack}>
          ← Users
        </Button>
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
      <Button variant="ghost" size="sm" className="mb-6" onClick={handleBack}>
        ← Users
      </Button>

      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-start gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold font-mono">{user.username}</h1>
            <span className={statusClass[user.status]}>
              {statusLabel[user.status]}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm mb-6">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{user.email ?? '—'}</dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{new Date(user.createdAt).toISOString().slice(0, 10)}</dd>
          <dt className="text-muted-foreground">Last Login</dt>
          <dd>
            {user.lastLoginAt
              ? new Date(user.lastLoginAt).toISOString().slice(0, 10)
              : '—'}
          </dd>
          <dt className="text-muted-foreground">Vault Size</dt>
          <dd>{formatBytes(user.vaultSizeBytes)}</dd>
          <dt className="text-muted-foreground">User ID</dt>
          <dd className="font-mono text-xs text-muted-foreground break-all">{user.userId}</dd>
        </dl>

        {admin.error && <p className="text-destructive text-sm mb-4">{admin.error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => admin.downloadUserVault(user.userId, user.username)}
            disabled={admin.loading}
          >
            Download Vault
          </Button>

          {user.status === 'pending_first_login' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshOtp}
                disabled={admin.loading}
              >
                Refresh OTP
              </Button>

              {deleteConfirm ? (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={admin.loading}
                  >
                    Confirm Delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirm(true)}
                >
                  Delete User
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
