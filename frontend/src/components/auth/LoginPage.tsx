import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, KeyRound } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
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

function postLoginPath(role: string, requirePasswordChange?: boolean): string {
  if (requirePasswordChange) {
    return role === 'admin' ? ROUTES.CHANGE_PASSWORD : ROUTES.ONBOARDING;
  }
  return role === 'admin' ? ROUTES.UI.ADMIN.DASHBOARD : ROUTES.UI.ROOT;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('auth');
  const { login, startPasskeyLogin, completeLogin, loading, error } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handlePasskeyClick = async () => {
    try {
      const res = await startPasskeyLogin();
      // User passkey login: complete immediately without password
      const loginRes = await completeLogin(res.passkeyToken);
      navigate(postLoginPath(loginRes.role, loginRes.requirePasswordChange));
    } catch {
      // error already set by useAuth
    }
  };

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await login(username, password);
      navigate(postLoginPath(res.role, res.requirePasswordChange));
    } catch {
      // error already set by useAuth
    }
  };

  return (
    <Layout>
      <div className="w-full max-w-sm">
        <Card>
          <img src={logo} alt="PassVault" className="w-full h-32 object-contain px-10 pt-6 bg-card" />
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{t('signIn')}</CardTitle>
            <CardDescription>{t('enterCredentials')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Button variant="outline" className="w-full" onClick={handlePasskeyClick} disabled={loading}>
              {loading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('common:pleaseWait')}</>
              ) : (
                <><KeyRound className="h-3.5 w-3.5" /> {t('signInWithPasskey')}</>
              )}
            </Button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 border-t border-border" />
              {t('common:or')}
              <div className="flex-1 border-t border-border" />
            </div>

            <form onSubmit={handleDirectSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="username">{t('common:username')}</Label>
                <Input id="username" type="text" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="password">{t('common:password')}</Label>
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              {/* Honeypot — hidden from real users */}
              <div style={{ display: 'none' }} aria-hidden="true">
                <input tabIndex={-1} name="email_confirm" autoComplete="off" />
              </div>
              <ErrorMessage message={error} />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('common:pleaseWait')}</> : t('signInBtn')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
