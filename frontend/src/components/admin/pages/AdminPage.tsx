import { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth.js';
import { validatePassword } from '@passvault/shared';

export function AdminPage() {
  const { adminChangePassword, loading } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

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
      await adminChangePassword({ newPassword });
      setSuccess(true);
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Admin</h1>

      <div className="bg-base-100 rounded-xl border border-base-300 p-6 max-w-md">
        <h2 className="text-base font-semibold mb-4">Change Password</h2>

        {success && (
          <p className="text-success text-sm mb-4">Password changed successfully.</p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="new-password" className="text-sm font-medium">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              className="input input-bordered input-sm"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="confirm-password" className="text-sm font-medium">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              className="input input-bordered input-sm"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          <p className="text-xs text-base-content/50">
            At least 12 characters with uppercase, lowercase, number, and special character.
          </p>

          {error && <p className="text-error text-sm">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-sm self-start"
            disabled={loading}
          >
            {loading ? 'Saving…' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
