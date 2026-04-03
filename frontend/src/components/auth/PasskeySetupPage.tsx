import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
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
import { config } from '../../config.js';
import { ROUTES } from '../../routes.js';

function getUserIdFromToken(token: string): string {
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  return payload.userId as string;
}

export function PasskeySetupPage() {
  const navigate = useNavigate();
  const { token, username, role, patchAuth } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  // Admin in prod: passkey is mandatory (no skip)
  const isMandatory = role === 'admin' && config.passkeyRequired;

  const handleRegister = async () => {
    if (!token || !username) return;
    setLoading(true);
    setError(null);
    try {
      const passkeyName = name.trim() || 'Passkey';
      const { challengeJwt } = role === 'admin'
        ? await api.getAdminPasskeyRegisterChallenge(token)
        : await api.getPasskeyRegisterChallenge(token);

      const userId = getUserIdFromToken(token);
      const attestation = await registerPasskey(challengeJwt, userId, username);

      if (role === 'admin') {
        await api.registerAdminPasskey({ challengeJwt, attestation, name: passkeyName }, token);
      } else {
        await api.registerPasskey({ challengeJwt, attestation, name: passkeyName }, token);
      }
      patchAuth({ status: 'active' });
      navigate(ROUTES.UI.ROOT, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    navigate(ROUTES.UI.ROOT, { replace: true });
  };

  return (
    <Layout>
      <div className="w-full max-w-sm">
        <Card>
          <img src={logo} alt="PassVault" className="w-full h-32 object-contain px-10 pt-6 bg-card" />
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Register Your Passkey</CardTitle>
            <CardDescription>
              {isMandatory
                ? 'Set up a passkey (fingerprint, face ID, or security key) to secure your account. This is required for administrators.'
                : 'Set up a passkey to sign in with biometrics or a security key instead of your password. You can also do this later from Security settings.'}
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
            <Button onClick={handleRegister} disabled={loading} className="w-full">
              {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for passkey...</> : 'Register passkey'}
            </Button>
            {!isMandatory && (
              <Button variant="ghost" onClick={handleSkip} className="w-full" disabled={loading}>
                Set up later
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
