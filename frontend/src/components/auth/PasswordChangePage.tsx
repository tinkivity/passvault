import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useAuthContext } from '../../context/AuthContext.js';
import { validatePassword } from '@passvault/shared';
import { Layout, Card, Button, Input, ErrorMessage } from '../layout/Layout.js';

interface PasswordChangePageProps {
  isAdmin?: boolean;
}

export function PasswordChangePage({ isAdmin = false }: PasswordChangePageProps) {
  const navigate = useNavigate();
  const { changePassword, adminChangePassword, logout, loading, role } = useAuth();
  const { username } = useAuthContext();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }

    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      setError(validation.errors.join(', '));
      return;
    }

    try {
      if (isAdmin || role === 'admin') {
        await adminChangePassword({ newPassword });
      } else {
        await changePassword({ newPassword });
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  const handleSuccessConfirm = () => {
    logout();
    navigate(isAdmin || role === 'admin' ? '/admin/login' : '/login', { replace: true });
  };

  if (success) {
    return (
      <Layout>
        <Card>
          <h1 className="text-xl font-bold mb-4 text-center">Password Changed</h1>
          <p className="text-center text-sm text-base-content/70 mb-6">
            Your password has been set successfully. Please log in with your new password.
          </p>
          <div className="flex justify-center">
            <Button onClick={handleSuccessConfirm}>
              Continue to Login
            </Button>
          </div>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <Card>
        <h1 className="text-xl font-bold mb-1 text-center">Change Password</h1>
        <p className="text-center text-sm text-base-content/50 mb-6">
          {username ? `Welcome, ${username}` : 'Set your new password'}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="New Password"
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
          />
          <Input
            label="Confirm Password"
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
          />
          <p className="text-xs text-base-content/50">
            Password must be at least 12 characters with uppercase, lowercase, number, and special character.
          </p>
          <ErrorMessage message={error} />
          <Button type="submit" loading={loading}>
            Set Password
          </Button>
        </form>
      </Card>
    </Layout>
  );
}
