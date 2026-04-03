import { useState } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OtpDisplayProps {
  username: string;
  oneTimePassword: string;
  onDone: () => void;
}

export function OtpDisplay({ username, oneTimePassword, onDone }: OtpDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(oneTimePassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const masked = '\u2022'.repeat(oneTimePassword.length);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded bg-amber-500/10 border border-amber-500/30 p-4">
        <p className="text-sm font-semibold text-amber-600 mb-1">
          User: <span className="font-mono">{username}</span>
        </p>
        <p className="text-xs text-amber-600/80 mb-3">
          Share this one-time password with the user. It will not be shown again.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-background border border-amber-500/30 rounded px-3 py-2 text-sm font-mono tracking-widest select-all">
            {revealed ? oneTimePassword : masked}
          </code>
          <Button variant="ghost" size="icon" onClick={() => setRevealed(r => !r)} title={revealed ? 'Hide' : 'Reveal'}>
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button variant="secondary" size="icon" onClick={handleCopy} title="Copy">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <Button onClick={onDone} disabled={!copied}>Done</Button>
    </div>
  );
}
