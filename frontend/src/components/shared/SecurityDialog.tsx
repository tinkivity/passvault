import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Trash2, ShieldCheck, Pencil, Check, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { ApiClient } from '../../services/api.js';
import { registerPasskey } from '../../services/passkey.js';
import { LIMITS, validatePassword } from '@passvault/shared';
import type { PasskeyListItem } from '@passvault/shared';
import { config } from '../../config.js';
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
import { Skeleton } from '@/components/ui/skeleton';

const api = new ApiClient();

function getUserIdFromToken(token: string): string {
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  return payload.userId as string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface SecurityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SecurityDialog({ open, onOpenChange }: SecurityDialogProps) {
  const { selfChangePassword, loading, token, username, role } = useAuth();
  const { t } = useTranslation('auth');

  // Password state
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  // Passkey state
  const [passkeys, setPasskeys] = useState<PasskeyListItem[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeyName, setPasskeyName] = useState('');
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyActionLoading, setPasskeyActionLoading] = useState(false);

  const isAdmin = role === 'admin';
  const maxPasskeys = isAdmin ? LIMITS.MAX_PASSKEYS_ADMIN : LIMITS.MAX_PASSKEYS_USER;
  const hasPasskeys = passkeys.length > 0;
  const showPasswordForm = isAdmin || !hasPasskeys;

  const canRevokePasskey = useCallback((credentialId: string) => {
    if (passkeys.length > 1) return true;
    // Last passkey: users can never revoke; admins can only revoke in non-prod
    if (isAdmin) return !config.passkeyRequired;
    return false;
  }, [passkeys.length, isAdmin]);

  const loadPasskeys = useCallback(async () => {
    if (!token) return;
    setPasskeysLoading(true);
    try {
      const res = isAdmin
        ? await api.listAdminPasskeys(token)
        : await api.listPasskeys(token);
      setPasskeys(res.passkeys);
    } catch {
      setPasskeys([]);
    } finally {
      setPasskeysLoading(false);
    }
  }, [token, isAdmin]);

  useEffect(() => {
    if (open) {
      setCurrent('');
      setNewPw('');
      setConfirm('');
      setPwError(null);
      setPwSuccess(false);
      setPasskeyName('');
      setPasskeyError(null);
      setPasskeyNotice(null);
      setRenamingId(null);
      loadPasskeys();
    }
  }, [open, loadPasskeys]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);

    if (newPw !== confirm) {
      setPwError(t('passwordsDoNotMatch'));
      return;
    }

    const validation = validatePassword(newPw);
    if (!validation.valid) {
      setPwError(validation.errors.join(', '));
      return;
    }

    try {
      await selfChangePassword({ currentPassword: current, newPassword: newPw });
      setPwSuccess(true);
      setCurrent('');
      setNewPw('');
      setConfirm('');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  const [passkeyNotice, setPasskeyNotice] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleRegisterPasskey = async () => {
    if (!token || !username || !passkeyName.trim()) return;
    setPasskeyActionLoading(true);
    setPasskeyError(null);
    setPasskeyNotice(null);
    try {
      const { challengeJwt } = isAdmin
        ? await api.getAdminPasskeyRegisterChallenge(token)
        : await api.getPasskeyRegisterChallenge(token);
      const userId = getUserIdFromToken(token);
      const existingIds = passkeys.map(pk => pk.credentialId);
      const attestation = await registerPasskey(challengeJwt, userId, username, existingIds);
      const registerFn = isAdmin ? api.registerAdminPasskey.bind(api) : api.registerPasskey.bind(api);
      const res = await registerFn({ challengeJwt, attestation, name: passkeyName.trim() }, token);
      setPasskeyName('');
      if ((res as { replacedExisting?: boolean }).replacedExisting) {
        setPasskeyNotice(t('existingPasskeyReplaced'));
      }
      await loadPasskeys();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('passkeyRegistrationFailed');
      setPasskeyError(msg);
    } finally {
      setPasskeyActionLoading(false);
    }
  };

  const handleRenamePasskey = async (credentialId: string) => {
    if (!token || !renameValue.trim()) return;
    setPasskeyActionLoading(true);
    try {
      if (isAdmin) {
        await api.renameAdminPasskey(credentialId, renameValue.trim(), token);
      } else {
        await api.renamePasskey(credentialId, renameValue.trim(), token);
      }
      setRenamingId(null);
      setRenameValue('');
      await loadPasskeys();
    } catch (err) {
      setPasskeyError(err instanceof Error ? err.message : 'Failed to rename passkey');
    } finally {
      setPasskeyActionLoading(false);
    }
  };

  const handleRevokePasskey = async (credentialId: string) => {
    if (!token) return;
    setPasskeyActionLoading(true);
    setPasskeyError(null);
    try {
      if (isAdmin) {
        await api.revokeAdminPasskey(credentialId, token);
      } else {
        await api.revokePasskey(credentialId, token);
      }
      await loadPasskeys();
    } catch (err) {
      setPasskeyError(err instanceof Error ? err.message : 'Failed to revoke passkey');
    } finally {
      setPasskeyActionLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t('common:security')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Password section */}
          <div>
            <Label className="text-sm font-semibold">{t('common:password')}</Label>
            {!isAdmin && hasPasskeys ? (
              <p className="mt-2 text-sm text-muted-foreground rounded-md bg-muted px-3 py-2">
                {t('passwordLoginDisabled')}
              </p>
            ) : showPasswordForm ? (
              <form onSubmit={handlePasswordSubmit} className="mt-2 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="sec-current">{t('currentPassword')}</Label>
                  <Input
                    id="sec-current"
                    type="password"
                    autoComplete="current-password"
                    value={current}
                    onChange={e => setCurrent(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="sec-new">{t('newPasswordLabel')}</Label>
                  <Input
                    id="sec-new"
                    type="password"
                    autoComplete="new-password"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="sec-confirm">{t('confirmNewPassword')}</Label>
                  <Input
                    id="sec-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('passwordRequirementsShort')}
                </p>
                {pwError && <p className="text-sm text-destructive">{pwError}</p>}
                {pwSuccess && <p className="text-sm text-green-600">{t('passwordChangedSuccess')}</p>}
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={loading}>
                    {loading ? t('common:saving') : t('changePasswordBtn')}
                  </Button>
                </div>
              </form>
            ) : null}
          </div>

          {/* Passkeys section */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">{t('passkeys')}</Label>
              {!passkeysLoading && (
                <span className="text-xs text-muted-foreground">
                  {passkeys.length} / {maxPasskeys}
                </span>
              )}
            </div>

            {!isAdmin && !hasPasskeys && !passkeysLoading && (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t('passkeyWarning')}
              </div>
            )}

            {passkeysLoading ? (
              <div className="mt-3 flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                {passkeys.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {passkeys.map(pk => (
                      <li
                        key={pk.credentialId}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                      >
                        {renamingId === pk.credentialId ? (
                          <div className="flex items-center gap-1 flex-1 mr-2">
                            <Input
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              maxLength={64}
                              className="h-7 text-sm"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') handleRenamePasskey(pk.credentialId); if (e.key === 'Escape') setRenamingId(null); }}
                            />
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRenamePasskey(pk.credentialId)} disabled={passkeyActionLoading}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRenamingId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{pk.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {t('registered', { date: formatDate(pk.createdAt) })}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                disabled={passkeyActionLoading}
                                onClick={() => { setRenamingId(pk.credentialId); setRenameValue(pk.name); }}
                                title={t('renamePasskey')}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                disabled={passkeyActionLoading || !canRevokePasskey(pk.credentialId)}
                                onClick={() => handleRevokePasskey(pk.credentialId)}
                                title={canRevokePasskey(pk.credentialId) ? t('revokePasskey') : t('cannotRevokeLastPasskey')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Register new passkey */}
                <div className="mt-3 flex items-end gap-2">
                  <div className="flex-1 flex flex-col gap-1">
                    <Label htmlFor="sec-passkey-name" className="text-xs">
                      {t('passkeyName')}
                    </Label>
                    <Input
                      id="sec-passkey-name"
                      placeholder="My MacBook, YubiKey..."
                      value={passkeyName}
                      onChange={e => setPasskeyName(e.target.value)}
                      maxLength={64}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      passkeyActionLoading ||
                      !passkeyName.trim() ||
                      passkeys.length >= maxPasskeys
                    }
                    onClick={handleRegisterPasskey}
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                    {passkeyActionLoading ? t('registeringPasskey') : t('registerPasskey')}
                  </Button>
                </div>
              </>
            )}

            {passkeyNotice && (
              <p className="mt-2 text-sm text-amber-700">{passkeyNotice}</p>
            )}
            {passkeyError && (
              <p className="mt-2 text-sm text-destructive">{passkeyError}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
