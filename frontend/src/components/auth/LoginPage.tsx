import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, KeyRound, ShieldCheck } from 'lucide-react';
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
  const { login, startPasskeyLogin, completeLogin, startAdminPasskeyVerification, completeAdminLogin, loading, error } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Admin two-step state
  const [adminPasskeyStep, setAdminPasskeyStep] = useState(false);
  const [savedPassword, setSavedPassword] = useState('');

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
      if (res.requirePasskeyVerification) {
        // Admin two-step: password verified, now need passkey
        setSavedPassword(password);
        setPassword('');
        setAdminPasskeyStep(true);
        return;
      }
      navigate(postLoginPath(res.role, res.requirePasswordChange));
    } catch {
      // error already set by useAuth
    }
  };

  const handleAdminPasskeyVerification = async () => {
    try {
      const verifyRes = await startAdminPasskeyVerification();
      const loginRes = await completeAdminLogin(verifyRes.passkeyToken, savedPassword);
      setSavedPassword('');
      navigate(postLoginPath(loginRes.role, loginRes.requirePasswordChange));
    } catch {
      // error already set by useAuth
    }
  };

  const handleCancelPasskeyStep = () => {
    setAdminPasskeyStep(false);
    setSavedPassword('');
  };

  // Auto-trigger passkey verification when entering step 2
  const passkeyTriggered = useRef(false);
  useEffect(() => {
    if (adminPasskeyStep && !passkeyTriggered.current) {
      passkeyTriggered.current = true;
      handleAdminPasskeyVerification().catch(() => {
        // On failure (user cancelled, timeout, etc.) — allow retry via button
        passkeyTriggered.current = false;
      });
    }
  }, [adminPasskeyStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2: Admin passkey verification
  if (adminPasskeyStep) {
    return (
      <Layout>
        <div className="w-full max-w-sm">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">{t('verifyIdentity')}</CardTitle>
              <CardDescription>{t('completeSignInPasskey')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ErrorMessage message={error} />
              {error && (
                <Button className="w-full" onClick={handleAdminPasskeyVerification} disabled={loading}>
                  {loading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('common:pleaseWait')}</>
                  ) : (
                    <><KeyRound className="h-3.5 w-3.5" /> {t('verifyWithPasskey')}</>
                  )}
                </Button>
              )}
              {!error && loading && (
                <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('common:pleaseWait')}
                </div>
              )}
              <Button variant="ghost" className="w-full" onClick={handleCancelPasskeyStep} disabled={loading}>
                {t('common:cancel')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Step 1: Normal login
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
