import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { ROUTES } from '../../routes.js';

export function PasswordChangePage() {
  const navigate = useNavigate();
  const { t } = useTranslation('auth');
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
      setError(t('passwordsDoNotMatch'));
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

  const handleContinue = () => {
    logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  if (success) {
    return (
      <Layout>
        <div className="w-full max-w-sm">
          <Card>
            <img src={logo} alt="PassVault" className="w-full h-32 object-contain px-10 pt-6 bg-card" />
            <CardHeader className="text-center">
              <CardTitle className="text-xl">{t('passwordChanged')}</CardTitle>
              <CardDescription>
                {t('passwordChangedDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleContinue} className="w-full">
                {t('continueToLogin')}
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
            <CardTitle className="text-xl">{t('changePassword')}</CardTitle>
            <CardDescription>
              {username ? t('welcomeUser', { username }) : t('setYourNewPassword')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="new-password">{t('newPassword')}</Label>
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
                <Label htmlFor="confirm-password">{t('confirmPassword')}</Label>
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
                {t('passwordRequirements')}
              </p>
              <ErrorMessage message={error} />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('common:pleaseWait')}</> : t('setPassword')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
