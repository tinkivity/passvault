import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useAuthContext } from '../../context/AuthContext.js';
import { Layout, Card, Button, Input, ErrorMessage } from '../layout/Layout.js';

interface TotpSetupPageProps {
  isAdmin?: boolean;
}

export function TotpSetupPage({ isAdmin = false }: TotpSetupPageProps) {
  const navigate = useNavigate();
  const { token } = useAuthContext();
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function setup() {
      if (!token) return;
      try {
        const res = isAdmin ? await api.adminTotpSetup(token) : await api.totpSetup(token);
        setQrCodeUrl(res.qrCodeUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get TOTP setup info');
      }
    }
    setup();
  }, [token, isAdmin]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (isAdmin) {
        await api.adminTotpVerify({ totpCode }, token);
        navigate('/admin/dashboard');
      } else {
        await api.totpVerify({ totpCode }, token);
        navigate('/vault');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Card>
        <h1 className="text-xl font-bold mb-2 text-center">Set Up Authenticator</h1>
        <p className="text-sm text-base-content/70 mb-4 text-center">
          Scan this QR code with your authenticator app, then enter the 6-digit code.
        </p>

        {qrCodeUrl ? (
          <div className="flex justify-center mb-4">
            <img src={qrCodeUrl} alt="TOTP QR Code" className="w-48 h-48" />
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-base-content/30 text-sm mb-4">
            Loading…
          </div>
        )}

        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <Input
            label="6-digit code"
            id="totp-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={totpCode}
            onChange={e => setTotpCode(e.target.value)}
            required
          />
          <ErrorMessage message={error} />
          <Button type="submit" loading={loading}>
            Verify
          </Button>
        </form>
      </Card>
    </Layout>
  );
}
