import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserSummary } from '@passvault/shared';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';
import { UserList } from '../UserList.js';
import { CreateUserForm } from '../CreateUserForm.js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function UsersPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const admin = useAdmin(token);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const refreshUsers = useCallback(async () => {
    const list = await admin.listUsers();
    setUsers(list);
    setUsersLoaded(true);
  }, [admin.listUsers]);

  useEffect(() => {
    if (!token || usersLoaded) return;
    refreshUsers();
  }, [token, usersLoaded, refreshUsers]);

  const handleCreateUser = async (username: string, email?: string) => {
    const result = await admin.createUser(username, email);
    await refreshUsers();
    return result;
  };

  const handleDeleteUser = async (userId: string) => {
    await admin.deleteUser(userId);
    await refreshUsers();
  };

  const handleRowClick = (user: UserSummary) => {
    navigate(`/admin/users/${user.userId}`, { state: { user } });
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
        onRowClick={handleRowClick}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <CreateUserForm
            onCreateUser={handleCreateUser}
            loading={admin.loading}
            onDone={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
