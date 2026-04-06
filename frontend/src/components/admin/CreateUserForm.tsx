import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateUserRequest, PreferredLanguage } from '@passvault/shared';
import { LIMITS } from '@passvault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpDisplay } from './OtpDisplay.js';

const LANGUAGE_OPTIONS: { value: PreferredLanguage; label: string }[] = [
  { value: 'auto', label: 'Auto (English)' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Fran\u00e7ais' },
  { value: 'ru', label: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439' },
];

function defaultExpiresAt(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

interface CreateUserFormProps {
  onCreateUser: (req: CreateUserRequest) => Promise<{ username: string; oneTimePassword: string }>;
  loading: boolean;
  onDone?: () => void;
  onOtpVisibleChange?: (visible: boolean) => void;
}

export function CreateUserForm({ onCreateUser, loading, onDone, onOtpVisibleChange }: CreateUserFormProps) {
  const { t } = useTranslation('admin');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [plan, setPlan] = useState<'free' | 'pro' | 'administrator'>('free');
  const [language, setLanguage] = useState<PreferredLanguage>('auto');
  const [adminConfirm, setAdminConfirm] = useState(false);
  const [isPerpetual, setIsPerpetual] = useState(false);
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt());
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; oneTimePassword: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!LIMITS.EMAIL_PATTERN.test(email.trim())) {
      setError(t('enterValidEmail'));
      return;
    }

    try {
      const req: CreateUserRequest = {
        username: email.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        displayName: displayName.trim() || undefined,
        plan,
        expiresAt: isPerpetual ? null : expiresAt || null,
        preferredLanguage: language,
      };
      const result = await onCreateUser(req);
      setCreated(result);
      onOtpVisibleChange?.(true);
      setEmail('');
      setFirstName('');
      setLastName('');
      setDisplayName('');
      setPlan('free');
      setLanguage('auto');
      setAdminConfirm(false);
      setIsPerpetual(false);
      setExpiresAt(defaultExpiresAt());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToCreateUser'));
    }
  };

  if (created) {
    return (
      <OtpDisplay
        username={created.username}
        oneTimePassword={created.oneTimePassword}
        onDone={() => { setCreated(null); onOtpVisibleChange?.(false); onDone?.(); }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="new-first-name">{t('common:firstName')}</Label>
          <Input
            id="new-first-name"
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="Jane"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-last-name">{t('common:lastName')}</Label>
          <Input
            id="new-last-name"
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="Smith"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="new-display-name">{t('common:displayName')} <span className="text-muted-foreground font-normal">({t('common:optional')})</span></Label>
        <Input
          id="new-display-name"
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Defaults to first + last name"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="new-username">{t('common:emailAddress')} <span className="text-destructive">*</span></Label>
        <Input
          id="new-username"
          type="text"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="user@example.com"
          maxLength={LIMITS.EMAIL_MAX_LENGTH}
          required
          autoFocus
        />
      </div>

      <div className="space-y-1">
        <Label>{t('common:plan')}</Label>
        <div className="flex gap-2">
          {(['free', 'pro', 'administrator'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => {
                if (p === 'administrator' && plan !== 'administrator') {
                  setAdminConfirm(true);
                }
                setPlan(p);
                if (p === 'administrator') setIsPerpetual(true);
              }}
              className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${plan === p ? (p === 'administrator' ? 'border-red-500 bg-red-500/10 text-red-600 font-medium' : 'border-primary bg-primary/10 text-primary font-medium') : 'border-border text-muted-foreground hover:border-primary/50'}`}
            >
              {p === 'administrator' ? t('common:admin') : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        {plan === 'administrator' && adminConfirm && (
          <p className="text-xs text-destructive mt-1">
            {t('adminCreateWarning')}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="new-language">{t('language')}</Label>
        <select
          id="new-language"
          value={language}
          onChange={e => setLanguage(e.target.value as PreferredLanguage)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {LANGUAGE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-expires-at">{t('common:expires')}</Label>
        <Input
          id="new-expires-at"
          type="date"
          value={expiresAt}
          onChange={e => setExpiresAt(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
          disabled={isPerpetual}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isPerpetual}
            onChange={e => setIsPerpetual(e.target.checked)}
            className="rounded"
          />
          {t('common:lifetimeNeverExpires')}
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? t('common:creating') : t('vault:createUser')}
      </Button>
    </form>
  );
}
