import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserSummary } from '@passvault/shared';
import { useAuth } from '../../hooks/useAuth.js';
import { useAdmin } from '../../hooks/useAdmin.js';
import { useAutoLogout } from '../../hooks/useAutoLogout.js';
import { Layout, Button } from '../layout/Layout.js';
import { CreateUserForm } from './CreateUserForm.js';
import { UserList } from './UserList.js';

const ADMIN_TIMEOUT = Number(import.meta.env.VITE_ADMIN_TIMEOUT_SECONDS ?? 86400);

export function AdminDashboard() {
  const navigate = useNavigate();
  const { token, username, logout } = useAuth();
  const { loading, createUser, listUsers, downloadUserVault } = useAdmin(token);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/admin/login', { replace: true });
  }, [logout, navigate]);

  const { secondsLeft } = useAutoLogout({
    timeoutSeconds: ADMIN_TIMEOUT,
    onLogout: handleLogout,
    active: !!token,
  });

  const refreshUsers = useCallback(async () => {
    const list = await listUsers();
    setUsers(list);
    setUsersLoaded(true);
  }, [listUsers]);

  useEffect(() => {
    if (!token || usersLoaded) return;
    refreshUsers();
  }, [token, usersLoaded, refreshUsers]);

  const handleCreateUser = async (un: string) => {
    const result = await createUser(un);
    await refreshUsers();
    return result;
  };

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const timeDisplay = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return (
    <Layout>
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
            <p className="text-xs text-base-content/50">Logged in as {username} · Session: {timeDisplay}</p>
          </div>
          <Button variant="danger" onClick={handleLogout}>
            Logout
          </Button>
        </div>

        <div className="bg-base-100 rounded-xl shadow-md p-6 mb-4">
          <h2 className="text-base font-semibold mb-4">Create User</h2>
          <CreateUserForm onCreateUser={handleCreateUser} loading={loading} />
        </div>

        <div className="bg-base-100 rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Users</h2>
            <Button variant="secondary" onClick={refreshUsers} disabled={loading}>
              Refresh
            </Button>
          </div>
          <UserList users={users} loading={loading && !usersLoaded} onDownload={downloadUserVault} />
        </div>
      </div>
    </Layout>
  );
}
