import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { config } from '../../config.js';
import { api } from '../../services/api.js';
import { useAuthContext } from '../../context/AuthContext.js';
import { puppySrc } from '../../utils/puppy-hash.js';
import { LIMITS } from '@passvault/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const LANGUAGE_OPTIONS = [
  { value: 'auto', labelKey: 'languageAuto' },
  { value: 'en', labelKey: 'languageEn' },
  { value: 'de', labelKey: 'languageDe' },
  { value: 'fr', labelKey: 'languageFr' },
  { value: 'ru', labelKey: 'languageRu' },
] as const;

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountDialog({ open, onOpenChange }: AccountDialogProps) {
  const { username, firstName, lastName, displayName, expiresAt, accountExpired, updateProfile, uploadAvatar, deleteAvatar, avatarBase64, userId, loading } = useAuth();
  const { token } = useAuthContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const { t, i18n } = useTranslation();

  const [form, setForm] = useState({
    firstName: firstName ?? '',
    lastName: lastName ?? '',
    displayName: displayName ?? '',
    email: username ?? '',
    language: (localStorage.getItem('pv_language') as string) || 'auto',
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
        language: (localStorage.getItem('pv_language') as string) || 'auto',
      });
      setError(null);
      setEmailChangeSuccess(null);
      setEmailChangeError(null);
    }
  }, [open, firstName, lastName, displayName, username]);

  const displayAvatarSrc = avatarBase64
    ? `data:image/jpeg;base64,${avatarBase64}`
    : puppySrc(userId ?? '');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so re-selecting the same file triggers onChange
    e.target.value = '';

    const validTypes = ['image/png', 'image/jpeg'];
    if (!validTypes.includes(file.type)) {
      setError(t('avatarInvalidType', { ns: 'auth' }));
      return;
    }
    if (file.size > LIMITS.AVATAR_MAX_UPLOAD_BYTES) {
      setError(t('avatarTooLarge', { ns: 'auth' }));
      return;
    }

    setAvatarUploading(true);
    setError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip the data:image/...;base64, prefix
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await uploadAvatar(base64, file.type as 'image/png' | 'image/jpeg');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSave'));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setAvatarUploading(true);
    setError(null);
    try {
      await deleteAvatar();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSave'));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleLanguageChange = (lang: string) => {
    setForm(f => ({ ...f, language: lang }));
    if (lang === 'auto') {
      localStorage.removeItem('pv_language');
      // Detect from navigator
      const detected = navigator.language.split('-')[0];
      void i18n.changeLanguage(['en', 'de', 'fr', 'ru'].includes(detected) ? detected : 'en');
    } else {
      localStorage.setItem('pv_language', lang);
      void i18n.changeLanguage(lang);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await updateProfile({
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        displayName: form.displayName.trim() || null,
        ...(config.isDev && form.email.trim() !== username ? { email: form.email.trim() } : {}),
        preferredLanguage: form.language,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSave'));
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
          <DialogTitle>{t('account')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="grid gap-4 pt-2">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="relative cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            >
              <Avatar className="h-20 w-20 rounded-full">
                <AvatarImage src={displayAvatarSrc} className="rounded-full" />
                <AvatarFallback className="rounded-full text-lg">
                  {(displayName ?? firstName ?? username ?? '?')[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-white" />
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={handleFileSelect}
            />
            {avatarUploading && (
              <p className="text-xs text-muted-foreground">{t('uploadingPhoto')}</p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={avatarUploading}>
                {t('changePhoto')}
              </Button>
              {avatarBase64 && (
                <Button type="button" variant="ghost" size="sm" onClick={handleRemovePhoto} disabled={avatarUploading}>
                  {t('removePhoto')}
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="account-first-name">{t('firstName')}</Label>
              <Input
                id="account-first-name"
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                placeholder="Jane"
                maxLength={64}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="account-last-name">{t('lastName')}</Label>
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
            <Label htmlFor="account-display-name">{t('displayName')}</Label>
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
              <Label htmlFor="account-email">{t('emailAddress')}</Label>
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
                {t('emailLoginNote')}
              </p>
            </div>
          ) : (
            /* Beta/Prod: read-only email with Change button */
            <div className="space-y-2">
              <Label>{t('emailAddress')}</Label>
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
                  {t('changeEmail')}
                </Button>
              </div>
              {emailChangeSuccess && (
                <p className="text-sm text-green-600">
                  {t('verificationSent', { email: emailChangeSuccess })}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label>{t('accountExpiration')}</Label>
            {expiresAt ? (
              <p className={`text-sm ${accountExpired ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                {accountExpired ? t('expiredOn', { date: new Date(expiresAt).toLocaleDateString() }) : t('expiresOn', { date: new Date(expiresAt).toLocaleDateString() })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noExpirationDate')}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="account-language">{t('language')}</Label>
            <select
              id="account-language"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.language}
              onChange={e => handleLanguageChange(e.target.value)}
            >
              {LANGUAGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('saving') : t('saveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Email change sub-dialog (beta/prod) */}
      {!config.isDev && (
        <Dialog open={emailChangeOpen} onOpenChange={setEmailChangeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('changeEmail')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEmailChangeSubmit} className="grid gap-4 pt-2">
              <p className="text-sm text-muted-foreground">
                {t('verificationLink')}
              </p>
              <div className="space-y-1">
                <Label htmlFor="new-email">{t('newEmailAddress')}</Label>
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
                  {t('cancel')}
                </Button>
                <Button type="submit" disabled={emailChangeLoading}>
                  {emailChangeLoading ? t('sending') : t('sendVerification')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
