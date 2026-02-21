import { useState } from 'react';
import { Button } from '../layout/Layout.js';

interface OtpDisplayProps {
  username: string;
  oneTimePassword: string;
  onDone: () => void;
}

export function OtpDisplay({ username, oneTimePassword, onDone }: OtpDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(oneTimePassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded bg-yellow-50 border border-yellow-200 p-4">
        <p className="text-sm font-semibold text-yellow-800 mb-1">
          User created: <span className="font-mono">{username}</span>
        </p>
        <p className="text-xs text-yellow-700 mb-3">
          Share this one-time password with the user. It will not be shown again.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-white border border-yellow-300 rounded px-3 py-2 text-sm font-mono tracking-widest select-all">
            {oneTimePassword}
          </code>
          <Button variant="secondary" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </div>
      <Button onClick={onDone}>Done</Button>
    </div>
  );
}
