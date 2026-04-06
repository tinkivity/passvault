import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { RefreshCw, Eye, EyeOff } from 'lucide-react';
import type { VaultItem, VaultItemCategory, VaultSummary } from '@passvault/shared';
import { useAuth } from '../../../hooks/useAuth.js';
import { useVaultShellContext } from '../VaultShell.js';
import { useVault } from '../../../hooks/useVault.js';
import { generateSecurePassword } from '../../../lib/password-gen.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ROUTES } from '../../../routes.js';

const CATEGORY_KEYS: { value: VaultItemCategory; key: string }[] = [
  { value: 'login', key: 'categoryLogin' },
  { value: 'note', key: 'categoryNote' },
  { value: 'email', key: 'categoryEmailAccount' },
  { value: 'credit_card', key: 'categoryCreditCard' },
  { value: 'identity', key: 'categoryIdentity' },
  { value: 'wifi', key: 'categoryWifi' },
  { value: 'private_key', key: 'categoryPrivateKey' },
];

function MaskedInput({
  id, value, onChange, label,
}: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-1">
        <Input id={id} type={visible ? 'text' : 'password'} autoComplete="off" value={value} onChange={e => onChange(e.target.value)} className="font-mono" />
        <Button type="button" variant="ghost" size="icon-sm" title={visible ? t('hide') : t('show')} onClick={() => setVisible(v => !v)}>
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function PasswordInput({
  id, value, onChange, label,
}: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-1">
        <Input id={id} type={visible ? 'text' : 'password'} autoComplete="off" value={value} onChange={e => onChange(e.target.value)} className="font-mono" />
        <Button type="button" variant="ghost" size="icon-sm" title={visible ? t('hide') : t('show')} onClick={() => setVisible(v => !v)}>
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
        <Button type="button" variant="outline" size="icon-sm" title={t('generatePassword')} onClick={() => onChange(generateSecurePassword())}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function VaultItemNewPage() {
  const { t } = useTranslation('vault');
  const { vaultId } = useParams<{ vaultId: string }>();
  const navigate = useNavigate();
  const { state } = useLocation();
  const vault = (state as { vault?: VaultSummary } | null)?.vault;
  const { token } = useAuth();
  const { resetVaultTimeout } = useVaultShellContext();
  const { fetchAllItems, addItem } = useVault(vaultId ?? null, token);

  const [category, setCategory] = useState<VaultItemCategory>('login');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string) => (v: string) => setFields(f => ({ ...f, [key]: v }));
  const get = (key: string, fallback = '') => fields[key] ?? fallback;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!get('name').trim()) { setError(t('nameIsRequired')); return; }

    setSaving(true);
    setError(null);
    try {
      const items = await fetchAllItems();
      const partial = buildPartial(category, fields);
      await addItem(items, { name: get('name'), category, ...partial } as Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt' | 'warningCodes'>);
      if (vaultId) resetVaultTimeout(vaultId);
      navigate(ROUTES.UI.ITEMS(vaultId!), { state: { vault } });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">{t('newItem')}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">{t('common:name')}</Label>
          <Input id="name" value={get('name')} onChange={e => set('name')(e.target.value)} required />
        </div>

        <div className="space-y-1">
          <Label htmlFor="category">{t('category')}</Label>
          <select
            id="category"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={category}
            onChange={e => { setCategory(e.target.value as VaultItemCategory); setFields(f => ({ name: f.name ?? '' })); }}
          >
            {CATEGORY_KEYS.map(c => <option key={c.value} value={c.value}>{t(c.key)}</option>)}
          </select>
        </div>

        <CategoryFields category={category} get={get} set={set} />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>{saving ? t('common:saving') : t('common:create')}</Button>
          <Button type="button" variant="outline" onClick={() => navigate(ROUTES.UI.ITEMS(vaultId!), { state: { vault } })}>
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}

function buildPartial(category: VaultItemCategory, f: Record<string, string>): Record<string, unknown> {
  switch (category) {
    case 'note': return { format: f.format || 'raw', text: f.text || '', comment: f.comment || undefined };
    case 'login': return { username: f.username || '', password: f.password || '', url: f.url || undefined, totp: f.totp || undefined, comment: f.comment || undefined };
    case 'email': return { emailAddress: f.emailAddress || '', password: f.password || '', imapHost: f.imapHost || undefined, imapPort: f.imapPort || undefined, smtpHost: f.smtpHost || undefined, smtpPort: f.smtpPort || undefined, comment: f.comment || undefined };
    case 'credit_card': return { cardholderName: f.cardholderName || '', cardNumber: f.cardNumber || '', expiryMonth: f.expiryMonth || '', expiryYear: f.expiryYear || '', cvv: f.cvv || '', pin: f.pin || undefined, comment: f.comment || undefined };
    case 'identity': return { firstName: f.firstName || '', lastName: f.lastName || '', dateOfBirth: f.dateOfBirth || undefined, nationality: f.nationality || undefined, passportNumber: f.passportNumber || undefined, idNumber: f.idNumber || undefined, address: f.address || undefined, phone: f.phone || undefined, comment: f.comment || undefined };
    case 'wifi': return { ssid: f.ssid || '', password: f.password || '', securityType: f.securityType || undefined, comment: f.comment || undefined };
    case 'private_key': return { privateKey: f.privateKey || '', publicKey: f.publicKey || undefined, passphrase: f.passphrase || undefined, keyType: f.keyType || undefined, comment: f.comment || undefined };
  }
}

function CategoryFields({ category, get, set }: {
  category: VaultItemCategory;
  get: (k: string, d?: string) => string;
  set: (k: string) => (v: string) => void;
}) {
  const { t } = useTranslation('vault');
  switch (category) {
    case 'note':
      return (
        <>
          <div className="space-y-1">
            <Label>{t('format')}</Label>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={get('format', 'raw')} onChange={e => set('format')(e.target.value)}>
              <option value="raw">{t('plainText')}</option>
              <option value="markdown">{t('markdown')}</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="text">{t('text')}</Label>
            <Textarea id="text" value={get('text')} onChange={e => set('text')(e.target.value)} rows={6} />
          </div>
          <div className="space-y-1"><Label htmlFor="comment">{t('comment')}</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
    case 'login':
      return (
        <>
          <div className="space-y-1"><Label htmlFor="username">{t('common:username')}</Label><Input id="username" value={get('username')} onChange={e => set('username')(e.target.value)} /></div>
          <PasswordInput id="password" label={t('common:password')} value={get('password')} onChange={set('password')} />
          <div className="space-y-1"><Label htmlFor="url">{t('url')}</Label><Input id="url" type="url" value={get('url')} onChange={e => set('url')(e.target.value)} placeholder="https://…" /></div>
          <div className="space-y-1"><Label htmlFor="comment">{t('comment')}</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
    case 'email':
      return (
        <>
          <div className="space-y-1"><Label htmlFor="emailAddress">{t('common:emailAddress')}</Label><Input id="emailAddress" type="email" value={get('emailAddress')} onChange={e => set('emailAddress')(e.target.value)} /></div>
          <PasswordInput id="password" label={t('common:password')} value={get('password')} onChange={set('password')} />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor="imapHost">{t('imapHost')}</Label><Input id="imapHost" value={get('imapHost')} onChange={e => set('imapHost')(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="imapPort">{t('imapPort')}</Label><Input id="imapPort" value={get('imapPort')} onChange={e => set('imapPort')(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="smtpHost">{t('smtpHost')}</Label><Input id="smtpHost" value={get('smtpHost')} onChange={e => set('smtpHost')(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="smtpPort">{t('smtpPort')}</Label><Input id="smtpPort" value={get('smtpPort')} onChange={e => set('smtpPort')(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="comment">{t('comment')}</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
    case 'credit_card':
      return (
        <>
          <div className="space-y-1"><Label htmlFor="cardholderName">{t('cardholderName')}</Label><Input id="cardholderName" value={get('cardholderName')} onChange={e => set('cardholderName')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="cardNumber">{t('cardNumber')}</Label><Input id="cardNumber" value={get('cardNumber')} onChange={e => set('cardNumber')(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label htmlFor="expiryMonth">MM</Label><Input id="expiryMonth" value={get('expiryMonth')} onChange={e => set('expiryMonth')(e.target.value)} maxLength={2} /></div>
            <div className="space-y-1"><Label htmlFor="expiryYear">YYYY</Label><Input id="expiryYear" value={get('expiryYear')} onChange={e => set('expiryYear')(e.target.value)} maxLength={4} /></div>
            <MaskedInput id="cvv" label="CVV" value={get('cvv')} onChange={set('cvv')} />
          </div>
          <MaskedInput id="pin" label="PIN" value={get('pin')} onChange={set('pin')} />
          <div className="space-y-1"><Label htmlFor="comment">{t('comment')}</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
    case 'identity':
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor="firstName">{t('common:firstName')}</Label><Input id="firstName" value={get('firstName')} onChange={e => set('firstName')(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="lastName">{t('common:lastName')}</Label><Input id="lastName" value={get('lastName')} onChange={e => set('lastName')(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="dateOfBirth">{t('dateOfBirth')}</Label><Input id="dateOfBirth" type="date" value={get('dateOfBirth')} onChange={e => set('dateOfBirth')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="nationality">{t('nationality')}</Label><Input id="nationality" value={get('nationality')} onChange={e => set('nationality')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="passportNumber">{t('passportNumber')}</Label><Input id="passportNumber" value={get('passportNumber')} onChange={e => set('passportNumber')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="idNumber">{t('idNumber')}</Label><Input id="idNumber" value={get('idNumber')} onChange={e => set('idNumber')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="address">{t('address')}</Label><Textarea id="address" value={get('address')} onChange={e => set('address')(e.target.value)} rows={2} /></div>
          <div className="space-y-1"><Label htmlFor="phone">{t('phone')}</Label><Input id="phone" type="tel" value={get('phone')} onChange={e => set('phone')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="comment">{t('comment')}</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
    case 'wifi':
      return (
        <>
          <div className="space-y-1"><Label htmlFor="ssid">{t('ssid')}</Label><Input id="ssid" value={get('ssid')} onChange={e => set('ssid')(e.target.value)} /></div>
          <PasswordInput id="password" label={t('common:password')} value={get('password')} onChange={set('password')} />
          <div className="space-y-1"><Label htmlFor="securityType">{t('securityType')}</Label><Input id="securityType" value={get('securityType')} onChange={e => set('securityType')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="comment">{t('comment')}</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
    case 'private_key':
      return (
        <>
          <div className="space-y-1"><Label htmlFor="keyType">{t('keyType')}</Label><Input id="keyType" value={get('keyType')} onChange={e => set('keyType')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="privateKey">{t('privateKey')}</Label><Textarea id="privateKey" value={get('privateKey')} onChange={e => set('privateKey')(e.target.value)} rows={5} className="font-mono text-xs" /></div>
          <div className="space-y-1"><Label htmlFor="publicKey">{t('publicKey')}</Label><Textarea id="publicKey" value={get('publicKey')} onChange={e => set('publicKey')(e.target.value)} rows={3} className="font-mono text-xs" /></div>
          <PasswordInput id="passphrase" label={t('passphrase')} value={get('passphrase')} onChange={set('passphrase')} />
          <div className="space-y-1"><Label htmlFor="comment">{t('comment')}</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
  }
}
