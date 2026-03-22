import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { Layout, Button, Input, ErrorMessage } from '../layout/Layout.js';
import logo from '../../assets/logo.png';

const PASSKEY_REQUIRED = import.meta.env.VITE_PASSKEY_REQUIRED === 'true';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, startPasskeyLogin, completeLogin, loading, error } = useAuth();

  // Passkey flow state (prod only)
  const [passkeyToken, setPasskeyToken] = useState<string | null>(null);
  const [encryptionSalt, setEncryptionSalt] = useState('');
  const [prefilledUsername, setPrefilledUsername] = useState('');

  // Direct login state (dev/beta)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handlePasskeyClick = async () => {
    try {
      const res = await startPasskeyLogin();
      setPasskeyToken(res.passkeyToken);
      setPrefilledUsername(res.username);
      setEncryptionSalt(res.encryptionSalt);
    } catch {
      // error already set by useAuth
    }
  };

  const handlePasskeyPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passkeyToken) return;
    try {
      const res = await completeLogin(passkeyToken, password, encryptionSalt);
      if (res.requirePasswordChange) {
        navigate('/change-password');
      } else if (res.requirePasskeySetup) {
        navigate('/passkey-setup');
      } else {
        navigate('/vault');
      }
    } catch {
      // error already set by useAuth
    }
  };

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await login(username, password);
      if (res.requirePasswordChange) {
        navigate('/change-password');
      } else {
        navigate('/vault');
      }
    } catch {
      // error already set by useAuth
    }
  };

  return (
    <Layout>
      <div className="bg-base-100 rounded-xl border border-base-300 w-full max-w-2xl flex overflow-hidden">
        {/* Logo panel */}
        <div className="flex-1 flex items-center justify-center p-8 border-r border-base-300">
          <img src={logo} alt="PassVault" className="max-w-full h-auto max-h-48" />
        </div>

        {/* Form panel */}
        <div className="flex-1 p-6 flex flex-col justify-center">
          {PASSKEY_REQUIRED ? (
            passkeyToken ? (
              /* Step 2: password entry after passkey identifies the user */
              <form onSubmit={handlePasskeyPasswordSubmit} className="flex flex-col gap-4">
                <Input
                  label="Username"
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={prefilledUsername}
                  readOnly
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
                <ErrorMessage message={error} />
                <Button type="submit" loading={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
            ) : (
              /* Step 1: passkey authentication */
              <div className="flex flex-col gap-4">
                <ErrorMessage message={error} />
                <Button onClick={handlePasskeyClick} loading={loading}>
                  {loading ? 'Waiting for passkey…' : 'Sign in with passkey'}
                </Button>
              </div>
            )
          ) : (
            /* Dev/beta: traditional username + password */
            <form onSubmit={handleDirectSubmit} className="flex flex-col gap-4">
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
              {/* Honeypot field — hidden from real users */}
              <div style={{ display: 'none' }} aria-hidden="true">
                <input tabIndex={-1} name="email_confirm" autoComplete="off" />
              </div>
              <ErrorMessage message={error} />
              <Button type="submit" loading={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </Layout>
  );
}
