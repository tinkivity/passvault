import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
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
import { config } from '../../config.js';
import { ROUTES } from '../../routes.js';

const PASSKEY_REQUIRED = config.passkeyRequired;

function postLoginPath(role: string, requirePasswordChange?: boolean, requirePasskeySetup?: boolean): string {
  if (requirePasswordChange) return ROUTES.CHANGE_PASSWORD;
  if (requirePasskeySetup) return ROUTES.PASSKEY_SETUP;
  return role === 'admin' ? ROUTES.UI.ADMIN.DASHBOARD : ROUTES.UI.ROOT;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login, startPasskeyLogin, completeLogin, loading, error } = useAuth();

  const [passkeyToken, setPasskeyToken] = useState<string | null>(null);
  const [prefilledUsername, setPrefilledUsername] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handlePasskeyClick = async () => {
    try {
      const res = await startPasskeyLogin();
      setPasskeyToken(res.passkeyToken);
      setPrefilledUsername(res.username);
    } catch {
      // error already set by useAuth
    }
  };

  const handlePasskeyPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passkeyToken) return;
    try {
      const res = await completeLogin(passkeyToken, password);
      navigate(postLoginPath(res.role, res.requirePasswordChange, res.requirePasskeySetup));
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
            <CardTitle className="text-xl">Sign In</CardTitle>
            <CardDescription>Enter your credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            {PASSKEY_REQUIRED ? (
              passkeyToken ? (
                <form onSubmit={handlePasskeyPasswordSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" type="text" autoComplete="username" value={prefilledUsername} readOnly />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
                  </div>
                  <ErrorMessage message={error} />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Please wait…</> : 'Sign in'}
                  </Button>
                </form>
              ) : (
                <div className="flex flex-col gap-4">
                  <ErrorMessage message={error} />
                  <Button className="w-full" onClick={handlePasskeyClick} disabled={loading}>
                    {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Please wait…</> : 'Sign in with passkey'}
                  </Button>
                </div>
              )
            ) : (
              <form onSubmit={handleDirectSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" type="text" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                {/* Honeypot — hidden from real users */}
                <div style={{ display: 'none' }} aria-hidden="true">
                  <input tabIndex={-1} name="email_confirm" autoComplete="off" />
                </div>
                <ErrorMessage message={error} />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Please wait…</> : 'Sign in'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
