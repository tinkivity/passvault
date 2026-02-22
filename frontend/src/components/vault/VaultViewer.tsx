import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { Button } from '../layout/Layout.js';

interface VaultViewerProps {
  content: string;
  lastModified: string | null;
  onEdit: () => void;
  onDownload: () => void;
  onLogout: () => void;
  secondsLeft: number;
}

export function VaultViewer({
  content,
  lastModified,
  onEdit,
  onDownload,
  onLogout,
  secondsLeft,
}: VaultViewerProps) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const isUrgent = secondsLeft <= 30;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-base-content/70">Vault</span>
          {lastModified && (
            <span className="text-xs text-base-content/40">
              Last saved {new Date(lastModified).toISOString().slice(0, 10)}
            </span>
          )}
        </div>
        <span
          className={`text-xs tabular-nums font-mono ${
            isUrgent ? 'text-error font-semibold' : 'text-base-content/50'
          }`}
        >
          Auto-logout {formatted}
        </span>
      </div>

      <pre className="flex-1 bg-base-200 border border-base-300 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap overflow-auto min-h-64 text-base-content">
        {content || <span className="text-base-content/30 italic">Vault is empty</span>}
      </pre>

      <div className="flex gap-2 mt-4 flex-wrap items-center">
        <Button onClick={onEdit}>Edit</Button>
        <button
          onClick={onDownload}
          className="btn btn-ghost btn-sm"
          title="Download backup"
          aria-label="Download backup"
        >
          <ArrowDownTrayIcon className="w-5 h-5" />
        </button>
        <Button variant="danger" onClick={onLogout} className="ml-auto">
          Logout
        </Button>
      </div>
    </div>
  );
}
