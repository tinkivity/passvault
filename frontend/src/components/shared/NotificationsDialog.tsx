import { useState, useEffect } from 'react';
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
  SelectValue,
} from '@/components/ui/select';

interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const defaultPrefs: NotificationPrefs = {
  vaultBackup: 'none',
};

export function NotificationsDialog({ open, onOpenChange }: NotificationsDialogProps) {
  const { token } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [loadingFetch, setLoadingFetch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    setLoadingFetch(true);
    setError(null);
    api.getNotificationPrefs(token)
      .then(p => setPrefs(p))
      .catch(() => setError('Failed to load notification preferences'))
      .finally(() => setLoadingFetch(false));
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
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="grid gap-6 pt-2">
          {/* Vault backup */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Vault backup emails</p>
            <p className="text-xs text-muted-foreground">
              Receive your encrypted vault file by email for safekeeping.
            </p>
            <Select
              value={prefs.vaultBackup}
              onValueChange={v => setPrefs(p => ({ ...p, vaultBackup: v as NotificationPrefs['vaultBackup'] }))}
              disabled={loadingFetch}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Off</SelectItem>
                <SelectItem value="weekly">Weekly backup</SelectItem>
                <SelectItem value="monthly">Monthly backup</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || loadingFetch}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
