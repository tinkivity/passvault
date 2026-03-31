import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
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

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountDialog({ open, onOpenChange }: AccountDialogProps) {
  const { username, firstName, lastName, displayName, updateProfile, loading } = useAuth();

  const [form, setForm] = useState({
    firstName: firstName ?? '',
    lastName: lastName ?? '',
    displayName: displayName ?? '',
    email: username ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Sync form when dialog opens or auth state changes
  useEffect(() => {
    if (open) {
      setForm({
        firstName: firstName ?? '',
        lastName: lastName ?? '',
        displayName: displayName ?? '',
        email: username ?? '',
      });
      setError(null);
      setSuccess(false);
    }
  }, [open, firstName, lastName, displayName, username]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    try {
      await updateProfile({
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        displayName: form.displayName.trim() || null,
        ...(form.email.trim() !== username ? { email: form.email.trim() } : {}),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="account-first-name">First name</Label>
              <Input
                id="account-first-name"
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                placeholder="Jane"
                maxLength={64}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="account-last-name">Last name</Label>
              <Input
                id="account-last-name"
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                placeholder="Smith"
                maxLength={64}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="account-display-name">Display name</Label>
            <Input
              id="account-display-name"
              value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              placeholder="Jane S."
              maxLength={64}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="account-email">Email address</Label>
            <Input
              id="account-email"
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jane@example.com"
              maxLength={254}
              required
            />
            <p className="text-xs text-muted-foreground">
              This is also your login email. Changing it takes effect immediately.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">Changes saved.</p>}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
