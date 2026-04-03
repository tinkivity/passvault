import { useState } from 'react';
import type { CreateUserRequest } from '@passvault/shared';
import { LIMITS } from '@passvault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpDisplay } from './OtpDisplay.js';

function defaultExpiresAt(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

interface CreateUserFormProps {
  onCreateUser: (req: CreateUserRequest) => Promise<{ username: string; oneTimePassword: string }>;
  loading: boolean;
  onDone?: () => void;
  onOtpVisibleChange?: (visible: boolean) => void;
}

export function CreateUserForm({ onCreateUser, loading, onDone, onOtpVisibleChange }: CreateUserFormProps) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [isPerpetual, setIsPerpetual] = useState(false);
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt());
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; oneTimePassword: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!LIMITS.EMAIL_PATTERN.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }

    try {
      const req: CreateUserRequest = {
        username: email.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        displayName: displayName.trim() || undefined,
        plan,
        expiresAt: isPerpetual ? null : expiresAt || null,
      };
      const result = await onCreateUser(req);
      setCreated(result);
      onOtpVisibleChange?.(true);
      setEmail('');
      setFirstName('');
      setLastName('');
      setDisplayName('');
      setPlan('free');
      setIsPerpetual(false);
      setExpiresAt(defaultExpiresAt());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  if (created) {
    return (
      <OtpDisplay
        username={created.username}
        oneTimePassword={created.oneTimePassword}
        onDone={() => { setCreated(null); onOtpVisibleChange?.(false); onDone?.(); }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="new-first-name">First name</Label>
          <Input
            id="new-first-name"
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="Jane"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-last-name">Last name</Label>
          <Input
            id="new-last-name"
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="Smith"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="new-display-name">Display name <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input
          id="new-display-name"
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Defaults to first + last name"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="new-username">Email address <span className="text-destructive">*</span></Label>
        <Input
          id="new-username"
          type="text"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="user@example.com"
          maxLength={LIMITS.EMAIL_MAX_LENGTH}
          required
          autoFocus
        />
      </div>

      <div className="space-y-1">
        <Label>Plan</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPlan('free')}
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${plan === 'free' ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}
          >
            Free
          </button>
          <button
            type="button"
            onClick={() => setPlan('pro')}
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${plan === 'pro' ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}
          >
            Pro
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-expires-at">Expires</Label>
        <Input
          id="new-expires-at"
          type="date"
          value={expiresAt}
          onChange={e => setExpiresAt(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
          disabled={isPerpetual}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isPerpetual}
            onChange={e => setIsPerpetual(e.target.checked)}
            className="rounded"
          />
          ♾ Lifetime — never expires
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Creating…' : 'Create user'}
      </Button>
    </form>
  );
}
