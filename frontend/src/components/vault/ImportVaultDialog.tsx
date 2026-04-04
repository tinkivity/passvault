import { useState, useRef, useCallback } from 'react';
import type { VaultDownloadResponse } from '@passvault/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload } from 'lucide-react';

type ImportStep = 'select' | 'preview' | 'importing';

interface ImportPreview {
  itemCount: number;
  categories: Record<string, number>;
}

interface ImportVaultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (displayName: string, fileData: VaultDownloadResponse, password: string) => Promise<void>;
}

function isVaultDownloadResponse(data: unknown): data is VaultDownloadResponse {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.encryptedIndex === 'string' &&
    typeof obj.encryptedItems === 'string' &&
    typeof obj.encryptionSalt === 'string' &&
    typeof obj.algorithm === 'string' &&
    typeof obj.lastModified === 'string' &&
    typeof obj.parameters === 'object' &&
    obj.parameters !== null
  );
}

export function ImportVaultDialog({ open, onOpenChange, onImport }: ImportVaultDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>('select');
  const [fileData, setFileData] = useState<VaultDownloadResponse | null>(null);
  const [fileName, setFileName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  const reset = useCallback(() => {
    setStep('select');
    setFileData(null);
    setFileName('');
    setDisplayName('');
    setPassword('');
    setPreview(null);
    setError(null);
    setPreviewing(false);
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(reader.result as string);
        if (!isVaultDownloadResponse(parsed)) {
          setError('Invalid vault file format. Please select a valid PassVault export file.');
          return;
        }
        setFileData(parsed);
        setFileName(file.name);
        // Suggest a display name from the filename
        const suggested = file.name
          .replace(/^passvault-/, '')
          .replace(/-\d{4}-\d{2}-\d{2}\.json$/, '')
          .replace(/[_-]/g, ' ')
          .replace(/\.json$/, '')
          .trim();
        if (suggested) setDisplayName(suggested);
      } catch {
        setError('Could not parse file. Please select a valid JSON file.');
      }
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    if (!fileData || !password) return;
    setPreviewing(true);
    setError(null);

    try {
      // Import crypto functions directly to do a temporary decrypt
      const { deriveKey, decrypt, clearKey } = await import('../../services/crypto.js');
      const tempVaultId = `__import_preview_${Date.now()}`;
      try {
        await deriveKey(tempVaultId, password, fileData.encryptionSalt);
        const indexPlaintext = await decrypt(tempVaultId, fileData.encryptedIndex);
        const indexFile = JSON.parse(indexPlaintext);

        const entries = indexFile.entries ?? indexFile.items ?? [];
        const categories: Record<string, number> = {};
        for (const entry of entries) {
          categories[entry.category] = (categories[entry.category] ?? 0) + 1;
        }

        setPreview({ itemCount: entries.length, categories });
        setStep('preview');
      } finally {
        clearKey(tempVaultId);
      }
    } catch {
      setError('Decryption failed. Check that the password is correct.');
    } finally {
      setPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!fileData || !password || !displayName.trim()) return;
    setImporting(true);
    setError(null);
    setStep('importing');

    try {
      await onImport(displayName.trim(), fileData, password);
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    } finally {
      setImporting(false);
    }
  };

  const categoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      login: 'Logins',
      email: 'Email accounts',
      note: 'Notes',
      credit_card: 'Credit cards',
      identity: 'Identities',
      wifi: 'Wi-Fi networks',
      private_key: 'Private keys',
    };
    return labels[cat] ?? cat;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden">
        <DialogHeader>
          <DialogTitle>Import Vault</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 min-w-0">
          {/* File picker */}
          <div className="space-y-1">
            <Label htmlFor="import-file">Vault file</Label>
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={step === 'importing'}
              >
                <Upload className="mr-2 h-4 w-4" />
                Choose file
              </Button>
              <span className="text-sm text-muted-foreground truncate min-w-0">
                {fileName || 'No file selected'}
              </span>
            </div>
            <input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Vault name */}
          <div className="space-y-1">
            <Label htmlFor="import-name">Vault name</Label>
            <Input
              id="import-name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="My Imported Vault"
              maxLength={64}
              disabled={step === 'importing'}
            />
          </div>

          {/* Password */}
          <div className="space-y-1">
            <Label htmlFor="import-password">Vault password</Label>
            <Input
              id="import-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !preview) handlePreview();
                if (e.key === 'Enter' && preview) handleImport();
              }}
              placeholder="Password used to encrypt this vault"
              disabled={step === 'importing'}
            />
            <p className="text-xs text-muted-foreground">
              Enter the password that was used when this vault was created.
            </p>
          </div>

          {/* Preview section */}
          {preview && (
            <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
              <p className="text-sm font-medium">
                {preview.itemCount} {preview.itemCount === 1 ? 'item' : 'items'} found
              </p>
              <ul className="text-sm text-muted-foreground space-y-0.5">
                {Object.entries(preview.categories)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, count]) => (
                    <li key={cat}>
                      {categoryLabel(cat)}: {count}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Error */}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          {!preview ? (
            <Button
              onClick={handlePreview}
              disabled={!fileData || !password || previewing || step === 'importing'}
            >
              {previewing ? 'Decrypting...' : 'Preview'}
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={importing || !displayName.trim()}
            >
              {importing ? 'Importing...' : 'Import'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
