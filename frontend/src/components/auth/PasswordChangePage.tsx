import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useAuthContext } from '../../context/AuthContext.js';
import { validatePassword } from '@passvault/shared';
import { Layout, ErrorMessage } from '../layout/Layout.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import logo from '../../assets/logo.png';
import { config } from '../../config.js';
import { ROUTES } from '../../routes.js';

const PASSKEY_REQUIRED = config.passkeyRequired;

export function PasswordChangePage() {
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
      if (role === 'admin') {
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
    if (PASSKEY_REQUIRED) {
      navigate(ROUTES.PASSKEY_SETUP, { replace: true });
    } else {
      logout();
      navigate(ROUTES.LOGIN, { replace: true });
    }
  };

  if (success) {
    return (
      <Layout>
        <div className="w-full max-w-sm">
          <Card>
            <img src={logo} alt="PassVault" className="w-full h-32 object-contain px-10 pt-6 bg-card" />
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Password Changed</CardTitle>
              <CardDescription>
                {PASSKEY_REQUIRED
                  ? 'Your password has been set. Next, register your passkey.'
                  : 'Your password has been set. Please log in with your new password.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-2">
              <Button onClick={handleSuccessConfirm}>
                {PASSKEY_REQUIRED ? 'Set Up Passkey' : 'Continue to Login'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="w-full max-w-sm">
        <Card>
          <img src={logo} alt="PassVault" className="w-full h-32 object-contain px-10 pt-6 bg-card" />
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Change Password</CardTitle>
            <CardDescription>
              {username ? `Welcome, ${username}` : 'Set your new password'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Password must be at least 12 characters with uppercase, lowercase, number, and special character.
              </p>
              <ErrorMessage message={error} />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Please wait…</> : 'Set Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
