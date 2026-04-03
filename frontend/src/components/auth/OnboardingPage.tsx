import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, KeyRound, Lock } from 'lucide-react';
import { api } from '../../services/api.js';
import { registerPasskey } from '../../services/passkey.js';
import { useAuthContext } from '../../context/AuthContext.js';
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

function getUserIdFromToken(token: string): string {
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  return payload.userId as string;
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const { token, username } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  const handleRegisterPasskey = async () => {
    if (!token || !username) return;
    setLoading(true);
    setError(null);
    try {
      const passkeyName = name.trim() || 'Passkey';
      const { challengeJwt } = await api.getPasskeyRegisterChallenge(token);
      const userId = getUserIdFromToken(token);
      const attestation = await registerPasskey(challengeJwt, userId, username);
      await api.registerPasskey({ challengeJwt, attestation, name: passkeyName }, token);
      navigate(ROUTES.UI.ROOT, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordPath = () => {
    navigate(ROUTES.CHANGE_PASSWORD, { replace: true });
  };

  return (
    <Layout>
      <div className="w-full max-w-sm">
        <Card>
          <img src={logo} alt="PassVault" className="w-full h-32 object-contain px-10 pt-6 bg-card" />
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Welcome to PassVault</CardTitle>
            <CardDescription>
              Choose how you want to secure your account. A passkey lets you sign in with
              biometrics or a security key. You can also set a traditional password instead.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-1">
              <Label htmlFor="passkey-name">Passkey name</Label>
              <Input
                id="passkey-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My MacBook, YubiKey..."
                maxLength={64}
              />
            </div>
            <ErrorMessage message={error} />
            <Button onClick={handleRegisterPasskey} disabled={loading} className="w-full">
              {loading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for passkey...</>
              ) : (
                <><KeyRound className="h-3.5 w-3.5" /> Set up passkey</>
              )}
            </Button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 border-t border-border" />
              or
              <div className="flex-1 border-t border-border" />
            </div>

            <Button variant="ghost" onClick={handlePasswordPath} disabled={loading} className="w-full">
              <Lock className="h-3.5 w-3.5" /> Set a password instead
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              You can set up a passkey later from Security settings.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
