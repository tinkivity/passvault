import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { validatePassword } from '@passvault/shared';
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
import { Separator } from '@/components/ui/separator';

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountDialog({ open, onOpenChange }: AccountDialogProps) {
  const { username, firstName, lastName, displayName, updateProfile, selfChangePassword, loading } = useAuth();

  const [form, setForm] = useState({
    firstName: firstName ?? '',
    lastName: lastName ?? '',
    displayName: displayName ?? '',
    email: username ?? '',
  });
  const [profileError, setProfileError] = useState<string | null>(null);

  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        firstName: firstName ?? '',
        lastName: lastName ?? '',
        displayName: displayName ?? '',
        email: username ?? '',
      });
      setProfileError(null);
      setPwForm({ current: '', newPw: '', confirm: '' });
      setPwError(null);
      setPwSuccess(false);
    }
  }, [open, firstName, lastName, displayName, username]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    try {
      await updateProfile({
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        displayName: form.displayName.trim() || null,
        ...(form.email.trim() !== username ? { email: form.email.trim() } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);

    if (pwForm.newPw !== pwForm.confirm) {
      setPwError('Passwords do not match');
      return;
    }

    const validation = validatePassword(pwForm.newPw);
    if (!validation.valid) {
      setPwError(validation.errors.join(', '));
      return;
    }

    try {
      await selfChangePassword({ currentPassword: pwForm.current, newPassword: pwForm.newPw });
      setPwSuccess(true);
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSaveProfile} className="grid gap-4 py-2">
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
          {profileError && <p className="text-sm text-destructive">{profileError}</p>}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>

        <Separator />

        <form onSubmit={handleChangePassword} className="grid gap-3 pt-2 pb-2">
          <p className="text-sm font-medium">Change password</p>
          <div className="space-y-1">
            <Label htmlFor="account-current-pw">Current password</Label>
            <Input
              id="account-current-pw"
              type="password"
              autoComplete="current-password"
              value={pwForm.current}
              onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="account-new-pw">New password</Label>
            <Input
              id="account-new-pw"
              type="password"
              autoComplete="new-password"
              value={pwForm.newPw}
              onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="account-confirm-pw">Confirm new password</Label>
            <Input
              id="account-confirm-pw"
              type="password"
              autoComplete="new-password"
              value={pwForm.confirm}
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            At least 12 characters with uppercase, lowercase, number, and special character.
          </p>
          {pwError && <p className="text-sm text-destructive">{pwError}</p>}
          {pwSuccess && <p className="text-sm text-green-600">Password changed successfully.</p>}
          <Button type="submit" variant="outline" disabled={loading}>
            {loading ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
