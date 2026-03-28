import { useState } from 'react';
import { LIMITS } from '@passvault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpDisplay } from './OtpDisplay.js';

interface CreateUserFormProps {
  onCreateUser: (username: string) => Promise<{ username: string; oneTimePassword: string }>;
  loading: boolean;
  onDone?: () => void;
}

export function CreateUserForm({ onCreateUser, loading, onDone }: CreateUserFormProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; oneTimePassword: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!LIMITS.EMAIL_PATTERN.test(username.trim())) {
      setError('Enter a valid email address');
      return;
    }

    try {
      const result = await onCreateUser(username.trim());
      setCreated(result);
      setUsername('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  if (created) {
    return (
      <OtpDisplay
        username={created.username}
        oneTimePassword={created.oneTimePassword}
        onDone={() => { setCreated(null); onDone?.(); }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="new-username">Email address</Label>
        <Input
          id="new-username"
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="user@example.com"
          maxLength={LIMITS.EMAIL_MAX_LENGTH}
          required
          autoFocus
        />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Creating…' : 'Create user'}
      </Button>
    </form>
  );
}
