import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { RefreshCw, Eye, EyeOff } from 'lucide-react';
import type { VaultItem, VaultItemCategory, VaultSummary } from '@passvault/shared';
import { useAuth } from '../../../hooks/useAuth.js';
import { useVault } from '../../../hooks/useVault.js';
import { generateSecurePassword } from '../../../lib/password-gen.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ROUTES } from '../../../routes.js';

const CATEGORIES: { value: VaultItemCategory; label: string }[] = [
  { value: 'login', label: 'Login' },
  { value: 'note', label: 'Note' },
  { value: 'email', label: 'Email Account' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'identity', label: 'Identity' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'private_key', label: 'Private Key' },
];

function MaskedInput({
  id, value, onChange, label,
}: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-1">
        <Input id={id} type={visible ? 'text' : 'password'} autoComplete="off" value={value} onChange={e => onChange(e.target.value)} className="font-mono" />
        <Button type="button" variant="ghost" size="icon-sm" title={visible ? 'Hide' : 'Show'} onClick={() => setVisible(v => !v)}>
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function PasswordInput({
  id, value, onChange, label,
}: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-1">
        <Input id={id} type={visible ? 'text' : 'password'} autoComplete="off" value={value} onChange={e => onChange(e.target.value)} className="font-mono" />
        <Button type="button" variant="ghost" size="icon-sm" title={visible ? 'Hide' : 'Show'} onClick={() => setVisible(v => !v)}>
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
        <Button type="button" variant="outline" size="icon-sm" title="Generate password" onClick={() => onChange(generateSecurePassword())}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function VaultItemNewPage() {
  const { vaultId } = useParams<{ vaultId: string }>();
  const navigate = useNavigate();
  const { state } = useLocation();
  const vault = (state as { vault?: VaultSummary } | null)?.vault;
  const { token } = useAuth();
  const { fetchAllItems, addItem } = useVault(vaultId ?? null, token);

  const [category, setCategory] = useState<VaultItemCategory>('login');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string) => (v: string) => setFields(f => ({ ...f, [key]: v }));
  const get = (key: string, fallback = '') => fields[key] ?? fallback;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!get('name').trim()) { setError('Name is required'); return; }

    setSaving(true);
    setError(null);
    try {
      const items = await fetchAllItems();
      const partial = buildPartial(category, fields);
      await addItem(items, { name: get('name'), category, ...partial } as Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt' | 'warningCodes'>);
      navigate(ROUTES.UI.ITEMS(vaultId!), { state: { vault } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-semibold">New Item</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={get('name')} onChange={e => set('name')(e.target.value)} placeholder="My Account" required />
        </div>

        <div className="space-y-1">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={category}
            onChange={e => { setCategory(e.target.value as VaultItemCategory); setFields(f => ({ name: f.name ?? '' })); }}
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <CategoryFields category={category} get={get} set={set} />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create'}</Button>
          <Button type="button" variant="outline" onClick={() => navigate(ROUTES.UI.ITEMS(vaultId!), { state: { vault } })}>
            Cancel
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
  switch (category) {
    case 'note':
      return (
        <>
          <div className="space-y-1">
            <Label>Format</Label>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={get('format', 'raw')} onChange={e => set('format')(e.target.value)}>
              <option value="raw">Plain text</option>
              <option value="markdown">Markdown</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="text">Text</Label>
            <Textarea id="text" value={get('text')} onChange={e => set('text')(e.target.value)} rows={6} />
          </div>
          <div className="space-y-1"><Label htmlFor="comment">Comment</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
    case 'login':
      return (
        <>
          <div className="space-y-1"><Label htmlFor="username">Username</Label><Input id="username" value={get('username')} onChange={e => set('username')(e.target.value)} /></div>
          <PasswordInput id="password" label="Password" value={get('password')} onChange={set('password')} />
          <div className="space-y-1"><Label htmlFor="url">URL</Label><Input id="url" type="url" value={get('url')} onChange={e => set('url')(e.target.value)} placeholder="https://…" /></div>
          <div className="space-y-1"><Label htmlFor="comment">Comment</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
    case 'email':
      return (
        <>
          <div className="space-y-1"><Label htmlFor="emailAddress">Email address</Label><Input id="emailAddress" type="email" value={get('emailAddress')} onChange={e => set('emailAddress')(e.target.value)} /></div>
          <PasswordInput id="password" label="Password" value={get('password')} onChange={set('password')} />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor="imapHost">IMAP host</Label><Input id="imapHost" value={get('imapHost')} onChange={e => set('imapHost')(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="imapPort">IMAP port</Label><Input id="imapPort" value={get('imapPort')} onChange={e => set('imapPort')(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="smtpHost">SMTP host</Label><Input id="smtpHost" value={get('smtpHost')} onChange={e => set('smtpHost')(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="smtpPort">SMTP port</Label><Input id="smtpPort" value={get('smtpPort')} onChange={e => set('smtpPort')(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="comment">Comment</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
    case 'credit_card':
      return (
        <>
          <div className="space-y-1"><Label htmlFor="cardholderName">Cardholder name</Label><Input id="cardholderName" value={get('cardholderName')} onChange={e => set('cardholderName')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="cardNumber">Card number</Label><Input id="cardNumber" value={get('cardNumber')} onChange={e => set('cardNumber')(e.target.value)} placeholder="•••• •••• •••• ••••" /></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label htmlFor="expiryMonth">MM</Label><Input id="expiryMonth" value={get('expiryMonth')} onChange={e => set('expiryMonth')(e.target.value)} placeholder="MM" maxLength={2} /></div>
            <div className="space-y-1"><Label htmlFor="expiryYear">YYYY</Label><Input id="expiryYear" value={get('expiryYear')} onChange={e => set('expiryYear')(e.target.value)} placeholder="YYYY" maxLength={4} /></div>
            <MaskedInput id="cvv" label="CVV" value={get('cvv')} onChange={set('cvv')} />
          </div>
          <MaskedInput id="pin" label="PIN" value={get('pin')} onChange={set('pin')} />
          <div className="space-y-1"><Label htmlFor="comment">Comment</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
    case 'identity':
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor="firstName">First name</Label><Input id="firstName" value={get('firstName')} onChange={e => set('firstName')(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="lastName">Last name</Label><Input id="lastName" value={get('lastName')} onChange={e => set('lastName')(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="dateOfBirth">Date of birth</Label><Input id="dateOfBirth" type="date" value={get('dateOfBirth')} onChange={e => set('dateOfBirth')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="nationality">Nationality</Label><Input id="nationality" value={get('nationality')} onChange={e => set('nationality')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="passportNumber">Passport number</Label><Input id="passportNumber" value={get('passportNumber')} onChange={e => set('passportNumber')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="idNumber">ID number</Label><Input id="idNumber" value={get('idNumber')} onChange={e => set('idNumber')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="address">Address</Label><Textarea id="address" value={get('address')} onChange={e => set('address')(e.target.value)} rows={2} /></div>
          <div className="space-y-1"><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" value={get('phone')} onChange={e => set('phone')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="comment">Comment</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
    case 'wifi':
      return (
        <>
          <div className="space-y-1"><Label htmlFor="ssid">SSID</Label><Input id="ssid" value={get('ssid')} onChange={e => set('ssid')(e.target.value)} /></div>
          <PasswordInput id="password" label="Password" value={get('password')} onChange={set('password')} />
          <div className="space-y-1"><Label htmlFor="securityType">Security type</Label><Input id="securityType" value={get('securityType')} onChange={e => set('securityType')(e.target.value)} placeholder="WPA2, WPA3…" /></div>
          <div className="space-y-1"><Label htmlFor="comment">Comment</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
    case 'private_key':
      return (
        <>
          <div className="space-y-1"><Label htmlFor="keyType">Key type</Label><Input id="keyType" value={get('keyType')} onChange={e => set('keyType')(e.target.value)} placeholder="RSA, Ed25519…" /></div>
          <div className="space-y-1"><Label htmlFor="privateKey">Private key</Label><Textarea id="privateKey" value={get('privateKey')} onChange={e => set('privateKey')(e.target.value)} rows={5} className="font-mono text-xs" /></div>
          <div className="space-y-1"><Label htmlFor="publicKey">Public key</Label><Textarea id="publicKey" value={get('publicKey')} onChange={e => set('publicKey')(e.target.value)} rows={3} className="font-mono text-xs" /></div>
          <PasswordInput id="passphrase" label="Passphrase" value={get('passphrase')} onChange={set('passphrase')} />
          <div className="space-y-1"><Label htmlFor="comment">Comment</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
        </>
      );
  }
}
