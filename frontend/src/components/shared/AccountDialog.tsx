import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { username, firstName, lastName, displayName, updateProfile, loading } = useAuth();
  const { t, i18n } = useTranslation();

  const [form, setForm] = useState({
    firstName: firstName ?? '',
    lastName: lastName ?? '',
    displayName: displayName ?? '',
    email: username ?? '',
    language: (localStorage.getItem('pv_language') as string) || 'auto',
  });
  const [error, setError] = useState<string | null>(null);

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
    }
  }, [open, firstName, lastName, displayName, username]);

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
        ...(form.email.trim() !== username ? { email: form.email.trim() } : {}),
        preferredLanguage: form.language,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSave'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('account')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="grid gap-4 pt-2">
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
    </Dialog>
  );
}
