import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { Layout, Card, Button, Input, ErrorMessage } from '../layout/Layout.js';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const { adminLogin, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await adminLogin({ username, password, totpCode: needsTotp ? totpCode : undefined });

      if (res.requirePasswordChange) {
        navigate('/admin/change-password');
      } else if (res.requireTotpSetup) {
        navigate('/admin/totp-setup');
      } else {
        navigate('/admin/dashboard');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.toLowerCase().includes('totp')) {
        setNeedsTotp(true);
      }
    }
  };

  return (
    <Layout>
      <Card>
        <h1 className="text-xl font-bold mb-1 text-center">PassVault</h1>
        <p className="text-center text-sm text-base-content/50 mb-6">Admin Login</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Username"
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
          <Input
            label="Password"
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {needsTotp && (
            <Input
              label="Authenticator Code"
              id="totp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={totpCode}
              onChange={e => setTotpCode(e.target.value)}
              required
            />
          )}
          <div style={{ display: 'none' }} aria-hidden="true">
            <input tabIndex={-1} name="email_confirm" autoComplete="off" />
          </div>
          <ErrorMessage message={error} />
          <Button type="submit" loading={loading}>
            Sign in
          </Button>
          <a
            href="/login"
            className="text-center text-xs text-base-content/40 hover:text-base-content/70 mt-2 transition-colors"
          >
            User login
          </a>
        </form>
      </Card>
    </Layout>
  );
}
