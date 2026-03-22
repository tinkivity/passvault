import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { registerPasskey } from '../../services/passkey.js';
import { useAuthContext } from '../../context/AuthContext.js';
import { Layout, Card, Button, ErrorMessage } from '../layout/Layout.js';

interface PasskeySetupPageProps {
  isAdmin?: boolean;
}

// Extract userId from the JWT payload (no signature verification — server verifies on submit).
function getUserIdFromToken(token: string): string {
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  return payload.userId as string;
}

export function PasskeySetupPage({ isAdmin = false }: PasskeySetupPageProps) {
  const navigate = useNavigate();
  const { token, username } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    if (!token || !username) return;
    setLoading(true);
    setError(null);
    try {
      const { challengeJwt } = isAdmin
        ? await api.getAdminPasskeyRegisterChallenge(token)
        : await api.getPasskeyRegisterChallenge(token);

      const userId = getUserIdFromToken(token);
      const attestation = await registerPasskey(challengeJwt, userId, username);

      if (isAdmin) {
        await api.registerAdminPasskey({ challengeJwt, attestation }, token);
        navigate('/admin/dashboard', { replace: true });
      } else {
        await api.registerPasskey({ challengeJwt, attestation }, token);
        navigate('/vault', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout theme="pv-dark">
      <Card>
        <h1 className="text-xl font-bold mb-2 text-center">Register Your Passkey</h1>
        <p className="text-sm text-base-content/70 mb-6 text-center">
          Set up a passkey (fingerprint, face ID, or security key) to secure your account.
          You'll use it every time you sign in.
        </p>
        <ErrorMessage message={error} />
        <div className="flex justify-center mt-4">
          <Button onClick={handleRegister} loading={loading}>
            {loading ? 'Waiting for passkey…' : 'Register passkey'}
          </Button>
        </div>
      </Card>
    </Layout>
  );
}
