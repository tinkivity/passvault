import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { Layout, Card, Button, Input, ErrorMessage } from '../layout/Layout.js';
import logo from '../../assets/logo.png';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await login({ username, password, totpCode: needsTotp ? totpCode : undefined });

      if (res.requirePasswordChange) {
        navigate('/change-password');
      } else if (res.requireTotpSetup) {
        navigate('/totp-setup');
      } else {
        navigate('/vault');
      }
    } catch (err: unknown) {
      // If server asks for TOTP, show TOTP field
      if (err instanceof Error && err.message.toLowerCase().includes('totp')) {
        setNeedsTotp(true);
      }
    }
  };

  return (
    <Layout>
      <Card>
        <div className="flex justify-center mb-6">
          <img src={logo} alt="PassVault" className="h-16 w-auto" />
        </div>
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
          {/* Honeypot field — hidden from real users */}
          <div style={{ display: 'none' }} aria-hidden="true">
            <input tabIndex={-1} name="email_confirm" autoComplete="off" />
          </div>
          <ErrorMessage message={error} />
          <Button type="submit" loading={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </Layout>
  );
}
