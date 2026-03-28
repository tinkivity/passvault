import { useState } from 'react';
import { ArrowDownTrayIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { Button } from '../layout/Layout.js';
import { Button as UIButton } from '@/components/ui/button';

const isEmailEnv = import.meta.env.VITE_ENVIRONMENT !== 'dev';

interface VaultViewerProps {
  content: string;
  lastModified: string | null;
  onEdit: () => void;
  onDownload: () => void;
  onSendEmail?: () => Promise<void>;
  onLogout: () => void;
  secondsLeft: number;
}

export function VaultViewer({
  content,
  lastModified,
  onEdit,
  onDownload,
  onSendEmail,
  onLogout,
  secondsLeft,
}: VaultViewerProps) {
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const isUrgent = secondsLeft <= 30;

  async function handleSendEmail() {
    if (!onSendEmail) return;
    setEmailSending(true);
    setEmailStatus('idle');
    setEmailError(null);
    try {
      await onSendEmail();
      setEmailStatus('sent');
    } catch (err) {
      setEmailStatus('error');
      setEmailError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setEmailSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground/70">Vault</span>
          {lastModified && (
            <span className="text-xs text-muted-foreground">
              Last saved {new Date(lastModified).toISOString().slice(0, 10)}
            </span>
          )}
        </div>
        <span
          className={`text-xs tabular-nums font-mono ${
            isUrgent ? 'text-destructive font-semibold' : 'text-muted-foreground'
          }`}
        >
          Auto-logout {formatted}
        </span>
      </div>

      <pre className="flex-1 bg-muted border border-border rounded-lg p-4 text-sm font-mono whitespace-pre-wrap overflow-auto min-h-64 text-foreground">
        {content || <span className="text-muted-foreground italic">Vault is empty</span>}
      </pre>

      <div className="flex gap-2 mt-4 flex-wrap items-center">
        <Button onClick={onEdit}>Edit</Button>
        <UIButton
          onClick={onDownload}
          variant="ghost"
          size="icon-sm"
          title="Download backup"
          aria-label="Download backup"
        >
          <ArrowDownTrayIcon className="w-5 h-5" />
        </UIButton>
        {isEmailEnv && onSendEmail && (
          <UIButton
            onClick={handleSendEmail}
            disabled={emailSending}
            variant="ghost"
            size="icon-sm"
            title="Send vault to email"
            aria-label="Send vault to email"
          >
            <EnvelopeIcon className="w-5 h-5" />
          </UIButton>
        )}
        {emailStatus === 'sent' && (
          <span className="text-xs text-green-600">Sent to your email</span>
        )}
        {emailStatus === 'error' && (
          <span className="text-xs text-destructive">{emailError}</span>
        )}
        <Button variant="danger" onClick={onLogout} className="ml-auto">
          Logout
        </Button>
      </div>
    </div>
  );
}
