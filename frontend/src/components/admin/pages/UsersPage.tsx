import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserSummary } from '@passvault/shared';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';
import { UserList } from '../UserList.js';
import { CreateUserForm } from '../CreateUserForm.js';

export function UsersPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const admin = useAdmin(token);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

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
          <button
            className="btn btn-ghost btn-sm"
            onClick={refreshUsers}
            disabled={admin.loading}
            title="Refresh"
            aria-label="Refresh"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => dialogRef.current?.showModal()}
          >
            + Create User
          </button>
        </div>
      </div>

      {admin.error && <p className="text-error text-sm mb-4">{admin.error}</p>}

      <div className="bg-base-100 rounded-xl border border-base-300 overflow-hidden">
        <UserList
          users={users}
          loading={admin.loading && !usersLoaded}
          onDownload={admin.downloadUserVault}
          onRefreshOtp={admin.refreshOtp}
          onDeleteUser={handleDeleteUser}
          onRowClick={handleRowClick}
        />
      </div>

      <dialog ref={dialogRef} className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg mb-4">Create User</h3>
          <CreateUserForm onCreateUser={handleCreateUser} loading={admin.loading} onDone={() => dialogRef.current?.close()} />
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost btn-sm">Close</button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>
  );
}
