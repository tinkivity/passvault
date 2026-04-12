import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { VaultDownloadResponse } from '@passvault/shared';
import { deriveKey, decrypt, clearKey } from '../../services/crypto.js';
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
  const { t } = useTranslation('vault');
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
    reader.onload = async () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(buffer);

        // Detect gzip by magic bytes (1f 8b)
        let jsonText: string;
        if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
          const ds = new DecompressionStream('gzip');
          const writer = ds.writable.getWriter();
          writer.write(bytes);
          writer.close();
          const decompressed = await new Response(ds.readable).text();
          jsonText = decompressed;
        } else {
          jsonText = new TextDecoder().decode(bytes);
        }

        const parsed: unknown = JSON.parse(jsonText);
        if (!isVaultDownloadResponse(parsed)) {
          setError(t('invalidVaultFile'));
          return;
        }
        setFileData(parsed);
        setFileName(file.name);
        // Suggest a display name from the filename
        const suggested = file.name
          .replace(/^passvault-/, '')
          .replace(/-\d{4}-\d{2}-\d{2}\.vault\.gz$/, '')
          .replace(/-\d{4}-\d{2}-\d{2}\.json$/, '')
          .replace(/\.vault\.gz$/, '')
          .replace(/\.json$/, '')
          .replace(/[_-]/g, ' ')
          .trim();
        if (suggested) setDisplayName(suggested);
      } catch {
        setError(t('cannotParseFile'));
      }
    };
    reader.onerror = () => setError(t('failedToReadFile'));
    reader.readAsArrayBuffer(file);
  };

  const handlePreview = async () => {
    if (!fileData || !password) return;
    setPreviewing(true);
    setError(null);

    try {
      // Import crypto functions directly to do a temporary decrypt
      // deriveKey, decrypt, clearKey imported statically at top
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
      setError(t('decryptionFailed'));
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
      setError(err instanceof Error ? err.message : t('importFailed'));
      setStep('preview');
    } finally {
      setImporting(false);
    }
  };

  const categoryLabel = (cat: string) => {
    const keys: Record<string, string> = {
      login: 'categoryLogins',
      email: 'categoryEmails',
      note: 'categoryNotes',
      credit_card: 'categoryCreditCards',
      identity: 'categoryIdentities',
      wifi: 'categoryWifiNetworks',
      private_key: 'categoryPrivateKeys',
    };
    return keys[cat] ? t(keys[cat]) : cat;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('importVaultTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 min-w-0">
          {/* File picker */}
          <div className="space-y-1">
            <Label htmlFor="import-file">{t('vaultFile')}</Label>
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={step === 'importing'}
              >
                <Upload className="mr-2 h-4 w-4" />
                {t('chooseFile')}
              </Button>
              <span className="text-sm text-muted-foreground truncate min-w-0">
                {fileName || t('noFileSelected')}
              </span>
            </div>
            <input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".json,.gz"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Vault name */}
          <div className="space-y-1">
            <Label htmlFor="import-name">{t('vaultName')}</Label>
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
            <Label htmlFor="import-password">{t('vaultPassword')}</Label>
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
              {t('vaultPasswordHint')}
            </p>
          </div>

          {/* Preview section */}
          {preview && (
            <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
              <p className="text-sm font-medium">
                {t('itemsFound', { count: preview.itemCount })}
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
            {t('common:cancel')}
          </Button>
          {!preview ? (
            <Button
              onClick={handlePreview}
              disabled={!fileData || !password || previewing || step === 'importing'}
            >
              {previewing ? t('decrypting') : t('preview')}
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={importing || !displayName.trim()}
            >
              {importing ? t('importing') : t('import')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
