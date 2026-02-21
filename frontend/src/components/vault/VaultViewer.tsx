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
          <span className="font-semibold text-sm text-gray-700">Vault</span>
          {lastModified && (
            <span className="text-xs text-gray-400">
              Last saved {new Date(lastModified).toISOString().slice(0, 10)}
            </span>
          )}
        </div>
        <span
          className={`text-xs tabular-nums font-mono ${
            isUrgent ? 'text-red-600 font-semibold' : 'text-gray-500'
          }`}
        >
          Auto-logout {formatted}
        </span>
      </div>

      <pre className="flex-1 bg-gray-50 border border-gray-200 rounded p-4 text-sm font-mono whitespace-pre-wrap overflow-auto min-h-64 text-gray-800">
        {content || <span className="text-gray-400 italic">Vault is empty</span>}
      </pre>

      <div className="flex gap-2 mt-4 flex-wrap">
        <Button onClick={onEdit}>Edit</Button>
        <Button variant="secondary" onClick={onDownload}>
          Download backup
        </Button>
        <Button variant="danger" onClick={onLogout} className="ml-auto">
          Logout
        </Button>
      </div>
    </div>
  );
}
