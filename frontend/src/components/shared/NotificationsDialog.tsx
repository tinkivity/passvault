import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { NotificationPrefs } from '@passvault/shared';
import { useAuth } from '../../hooks/useAuth.js';
import { api } from '../../services/api.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const defaultPrefs: NotificationPrefs = {
  vaultBackup: 'none',
};

function useBackupLabel(value: string): string {
  const { t } = useTranslation();
  const labels: Record<string, string> = {
    none: t('off'),
    weekly: t('admin:weeklyBackup'),
    monthly: t('admin:monthlyBackup'),
    quarterly: t('admin:quarterlyBackup'),
  };
  return labels[value] ?? value;
}

export function NotificationsDialog({ open, onOpenChange }: NotificationsDialogProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const selectedLabel = useBackupLabel(prefs.vaultBackup);
  const [loadingFetch, setLoadingFetch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    setLoadingFetch(true);
    setError(null);
    api.getNotificationPrefs(token)
      .then(p => {
        setPrefs(p);
        setLoadingFetch(false);
      })
      .catch(() => {
        setError(t('admin:failedToLoadPrefs'));
        setLoadingFetch(false);
      });
  }, [open, token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateNotificationPrefs(prefs, token);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin:failedToSavePrefs'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('notifications')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="grid gap-6 pt-2">
          {/* Vault backup */}
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('admin:vaultBackupEmails')}</p>
            <p className="text-xs text-muted-foreground">
              {t('admin:vaultBackupEmailsDesc')}
            </p>
            {loadingFetch ? (
              <div className="flex h-9 w-full items-center rounded-md border border-input px-3 text-sm text-muted-foreground">{t('common:loading')}</div>
            ) : (
              <Select
                value={prefs.vaultBackup}
                onValueChange={v => setPrefs(p => ({ ...p, vaultBackup: v as NotificationPrefs['vaultBackup'] }))}
              >
                <SelectTrigger>
                  <span>{selectedLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('off')}</SelectItem>
                  <SelectItem value="weekly">{t('admin:weeklyBackup')}</SelectItem>
                  <SelectItem value="monthly">{t('admin:monthlyBackup')}</SelectItem>
                  <SelectItem value="quarterly">{t('admin:quarterlyBackup')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving || loadingFetch}>
              {saving ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
