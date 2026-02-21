import { useState } from 'react';
import { LIMITS } from '@passvault/shared';
import { Button, Input, ErrorMessage } from '../layout/Layout.js';
import { OtpDisplay } from './OtpDisplay.js';

interface CreateUserFormProps {
  onCreateUser: (username: string) => Promise<{ username: string; oneTimePassword: string }>;
  loading: boolean;
}

export function CreateUserForm({ onCreateUser, loading }: CreateUserFormProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; oneTimePassword: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!LIMITS.USERNAME_PATTERN.test(username)) {
      setError('Username must be 3-30 characters, alphanumeric with hyphens/underscores');
      return;
    }

    try {
      const result = await onCreateUser(username);
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
        onDone={() => setCreated(null)}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        label="Username"
        id="new-username"
        type="text"
        value={username}
        onChange={e => setUsername(e.target.value)}
        minLength={LIMITS.USERNAME_MIN_LENGTH}
        maxLength={LIMITS.USERNAME_MAX_LENGTH}
        pattern="[a-zA-Z0-9_-]+"
        required
      />
      <ErrorMessage message={error} />
      <Button type="submit" loading={loading}>
        Create user
      </Button>
    </form>
  );
}
