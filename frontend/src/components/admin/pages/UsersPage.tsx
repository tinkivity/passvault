import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CreateUserRequest, UserSummary } from '@passvault/shared';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';
import { UserList } from '../UserList.js';
import { CreateUserForm } from '../CreateUserForm.js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function UsersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token } = useAuth();
  const admin = useAdmin(token);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === '1');

  const refreshUsers = useCallback(async () => {
    const list = await admin.listUsers();
    setUsers(list);
    setUsersLoaded(true);
  }, [admin.listUsers]);

  useEffect(() => {
    if (!token || usersLoaded) return;
    refreshUsers();
  }, [token, usersLoaded, refreshUsers]);

  // Keep dialog open when ?create=1 is in the URL
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreateOpen(true);
    }
  }, [searchParams]);

  const handleDialogOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open && searchParams.has('create')) {
      setSearchParams({}, { replace: true });
    }
  };

  const handleCreateUser = async (req: CreateUserRequest) => {
    const result = await admin.createUser(req);
    await refreshUsers();
    return result;
  };

  const handleDeleteUser = async (userId: string) => {
    await admin.deleteUser(userId);
    await refreshUsers();
  };

  const handleLockUser = async (userId: string) => {
    await admin.lockUser(userId);
    await refreshUsers();
  };

  const handleUnlockUser = async (userId: string) => {
    await admin.unlockUser(userId);
    await refreshUsers();
  };

  const handleExpireUser = async (userId: string) => {
    await admin.expireUser(userId);
    await refreshUsers();
  };

  const handleReactivateUser = async (userId: string, expiresAt: string | null) => {
    await admin.reactivateUser(userId, expiresAt);
    await refreshUsers();
  };

  const handleRowClick = (user: UserSummary) => {
    navigate(`/ui/admin/users/${user.userId}`, { state: { user } });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Users</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refreshUsers}
            disabled={admin.loading}
            title="Refresh"
            aria-label="Refresh"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            + Create User
          </Button>
        </div>
      </div>

      {admin.error && <p className="text-destructive text-sm mb-4">{admin.error}</p>}

      <UserList
        users={users}
        loading={admin.loading && !usersLoaded}
        onDownload={admin.downloadUserVault}
        onRefreshOtp={admin.refreshOtp}
        onDeleteUser={handleDeleteUser}
        onLockUser={handleLockUser}
        onUnlockUser={handleUnlockUser}
        onExpireUser={handleExpireUser}
        onReactivateUser={handleReactivateUser}
        onEmailVault={admin.emailUserVault}
        onRowClick={handleRowClick}
      />

      <Dialog open={createOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <CreateUserForm
            onCreateUser={handleCreateUser}
            loading={admin.loading}
            onDone={() => handleDialogOpenChange(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
