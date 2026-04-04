import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth.js';
import { useEncryptionContext } from '../../../context/EncryptionContext.js';
import { useVaultShellContext } from '../VaultShell.js';
import { api } from '../../../services/api.js';
import { decrypt } from '../../../services/crypto.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES } from '../../../routes.js';

export function VaultUnlockPage() {
  const { vaultId } = useParams<{ vaultId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('vault');
  const { token, logout } = useAuth();
  const { deriveKey, clearKey } = useEncryptionContext();
  const { vaults } = useVaultShellContext();

  const vault = vaults.find(v => v.vaultId === vaultId);

  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultId || !vault) return;
    setLoading(true);
    setUnlockError(null);
    try {
      await deriveKey(vaultId, password, vault.encryptionSalt);

      // Verify the password is correct by attempting to decrypt vault content
      const res = await api.getVault(vaultId, token!);
      if (res.encryptedContent) {
        try {
          await decrypt(vaultId, res.encryptedContent);
        } catch {
          clearKey(vaultId);
          setUnlockError(t('incorrectPassword'));
          return;
        }
      }

      navigate(ROUTES.UI.ITEMS(vaultId));
    } catch (err) {
      if (!unlockError) {
        setUnlockError(err instanceof Error ? err.message : t('failedToUnlock'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (!vault) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('vaultNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-8 space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <LockClosedIcon className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{vault.displayName}</h1>
          <p className="text-sm text-muted-foreground">
            {t('enterVaultPassword')}
          </p>
        </div>
        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="vault-password">{t('common:password')}</Label>
            <Input
              id="vault-password"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {unlockError && <p className="text-sm text-destructive">{unlockError}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />{t('unlocking')}</> : t('openVault')}
          </Button>
        </form>
        <div className="text-center">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => { logout(); navigate(ROUTES.LOGIN, { replace: true }); }}
          >
            {t('auth:signOutInstead')}
          </button>
        </div>
      </div>
    </div>
  );
}
