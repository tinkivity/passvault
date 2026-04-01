import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '../../services/api.js';
import { registerPasskey } from '../../services/passkey.js';
import { useAuthContext } from '../../context/AuthContext.js';
import { Layout, ErrorMessage } from '../layout/Layout.js';
import { Button } from '@/components/ui/button';
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

export function PasskeySetupPage() {
  const navigate = useNavigate();
  const { token, username, role } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    if (!token || !username) return;
    setLoading(true);
    setError(null);
    try {
      const { challengeJwt } = role === 'admin'
        ? await api.getAdminPasskeyRegisterChallenge(token)
        : await api.getPasskeyRegisterChallenge(token);

      const userId = getUserIdFromToken(token);
      const attestation = await registerPasskey(challengeJwt, userId, username);

      if (role === 'admin') {
        await api.registerAdminPasskey({ challengeJwt, attestation }, token);
      } else {
        await api.registerPasskey({ challengeJwt, attestation }, token);
      }
      navigate(ROUTES.UI.ROOT, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="w-full max-w-sm">
        <Card>
          <img src={logo} alt="PassVault" className="w-full h-32 object-contain px-10 pt-6 bg-card" />
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Register Your Passkey</CardTitle>
            <CardDescription>
              Set up a passkey (fingerprint, face ID, or security key) to secure your account.
              You'll use it every time you sign in.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 items-center">
            <ErrorMessage message={error} />
            <Button onClick={handleRegister} disabled={loading}>
              {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for passkey…</> : 'Register passkey'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
