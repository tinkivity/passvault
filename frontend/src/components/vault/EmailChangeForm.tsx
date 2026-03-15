import { useState } from 'react';
import { LIMITS } from '@passvault/shared';
import { Button, Input, ErrorMessage } from '../layout/Layout.js';

interface EmailChangeFormProps {
  currentEmail: string | null;
  onRequestChange: (newEmail: string, password: string) => Promise<void>;
  onConfirmChange: (code: string) => Promise<void>;
}

type Step = 'request' | 'verify';

export function EmailChangeForm({ currentEmail, onRequestChange, onConfirmChange }: EmailChangeFormProps) {
  const [step, setStep] = useState<Step>('request');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);

  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onRequestChange(newEmail, password);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request email change');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onConfirmChange(code);
      setConfirmedEmail(newEmail);
      setSuccess(true);
      setStep('request');
      setNewEmail('');
      setPassword('');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm email change');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-sm text-success">
        Email updated to {confirmedEmail}.{' '}
        <button className="underline" onClick={() => setSuccess(false)}>Change again</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-base-content/50">
        Current email: <span className="font-mono">{currentEmail ?? '—'}</span>
      </div>

      {step === 'request' ? (
        <form onSubmit={handleRequestSubmit} className="flex flex-col gap-3">
          <Input
            label="New email address"
            id="email-new"
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            maxLength={LIMITS.EMAIL_MAX_LENGTH}
            required
          />
          <Input
            label="Current password (to confirm)"
            id="email-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <ErrorMessage message={error} />
          <Button type="submit" loading={loading}>
            Send verification code
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifySubmit} className="flex flex-col gap-3">
          <p className="text-xs text-base-content/60">
            A 6-digit verification code has been sent to {newEmail}.
          </p>
          <Input
            label="Verification code"
            id="email-code"
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            maxLength={6}
            pattern="[0-9]{6}"
            required
          />
          <ErrorMessage message={error} />
          <div className="flex gap-2">
            <Button type="submit" loading={loading}>
              Confirm
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setStep('request'); setError(null); }}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
