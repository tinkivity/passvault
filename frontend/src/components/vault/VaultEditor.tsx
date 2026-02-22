import { useState } from 'react';
import { Button, ErrorMessage } from '../layout/Layout.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { LIMITS } from '@passvault/shared';

interface VaultEditorProps {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  secondsLeft: number;
}

export function VaultEditor({
  initialContent,
  onSave,
  onCancel,
  saving,
  error,
  secondsLeft,
}: VaultEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [showConfirm, setShowConfirm] = useState(false);
  const isDirty = content !== initialContent;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const isUrgent = secondsLeft <= 30;

  const handleCancel = () => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onCancel();
    }
  };

  const byteSize = new TextEncoder().encode(content).length;
  const overLimit = byteSize > LIMITS.MAX_FILE_SIZE_BYTES;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <span className="font-semibold text-sm text-base-content/70">Edit Vault</span>
        <span
          className={`text-xs tabular-nums font-mono ${
            isUrgent ? 'text-error font-semibold' : 'text-base-content/50'
          }`}
        >
          Auto-logout {formatted}
        </span>
      </div>

      <textarea
        className="textarea textarea-bordered flex-1 w-full font-mono resize-none min-h-64"
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Enter your sensitive text here…"
        spellCheck={false}
        autoFocus
      />

      <div className="flex items-center justify-between mt-1">
        <span className={`text-xs ${overLimit ? 'text-error font-semibold' : 'text-base-content/30'}`}>
          {(byteSize / 1024).toFixed(1)} KB / 1024 KB
        </span>
      </div>

      <ErrorMessage message={error} />

      <div className="flex gap-2 mt-3">
        <Button
          onClick={() => onSave(content)}
          loading={saving}
          disabled={overLimit || saving}
        >
          Save & logout
        </Button>
        <Button variant="secondary" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
      </div>

      {showConfirm && (
        <ConfirmDialog
          message="You have unsaved changes. Discard them and exit edit mode?"
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          variant="danger"
          onConfirm={() => { setShowConfirm(false); onCancel(); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
