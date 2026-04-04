import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { config } from '../../config.js';
import { api } from '../../services/api.js';
import { useAuthContext } from '../../context/AuthContext.js';
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
  const { token } = useAuthContext();

  const [form, setForm] = useState({
    firstName: firstName ?? '',
    lastName: lastName ?? '',
    displayName: displayName ?? '',
    email: username ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  // Email change sub-dialog state (beta/prod)
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);
  const [emailChangeSuccess, setEmailChangeSuccess] = useState<string | null>(null);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({
        firstName: firstName ?? '',
        lastName: lastName ?? '',
        displayName: displayName ?? '',
        email: username ?? '',
      });
      setError(null);
      setEmailChangeSuccess(null);
      setEmailChangeError(null);
    }
  }, [open, firstName, lastName, displayName, username]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await updateProfile({
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        displayName: form.displayName.trim() || null,
        ...(config.isDev && form.email.trim() !== username ? { email: form.email.trim() } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  const handleEmailChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setEmailChangeLoading(true);
    setEmailChangeError(null);
    setEmailChangeSuccess(null);
    try {
      await api.requestEmailChange(newEmail.trim(), token);
      setEmailChangeSuccess(newEmail.trim());
      setNewEmail('');
      setEmailChangeOpen(false);
    } catch (err) {
      setEmailChangeError(err instanceof Error ? err.message : 'Failed to request email change');
    } finally {
      setEmailChangeLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="grid gap-4 pt-2">
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

          {config.isDev ? (
            /* Dev: direct email input */
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
          ) : (
            /* Beta/Prod: read-only email with Change button */
            <div className="space-y-2">
              <Label>Email address</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={username ?? ''}
                  readOnly
                  disabled
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmailChangeOpen(true);
                    setNewEmail('');
                    setEmailChangeError(null);
                    setEmailChangeSuccess(null);
                  }}
                >
                  Change Email
                </Button>
              </div>
              {emailChangeSuccess && (
                <p className="text-sm text-green-600">
                  Verification email sent to {emailChangeSuccess}. Check your inbox.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Email change sub-dialog (beta/prod) */}
      {!config.isDev && (
        <Dialog open={emailChangeOpen} onOpenChange={setEmailChangeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Email Address</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEmailChangeSubmit} className="grid gap-4 pt-2">
              <p className="text-sm text-muted-foreground">
                A verification link will be sent to the new email address.
                Your current email will receive a notification.
              </p>
              <div className="space-y-1">
                <Label htmlFor="new-email">New email address</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="newemail@example.com"
                  maxLength={254}
                  required
                  autoFocus
                />
              </div>
              {emailChangeError && (
                <p className="text-sm text-destructive">{emailChangeError}</p>
              )}
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setEmailChangeOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={emailChangeLoading}>
                  {emailChangeLoading ? 'Sending...' : 'Send verification'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
