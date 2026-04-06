import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { RefreshCw, Loader2, Eye, EyeOff } from 'lucide-react';
import Markdown from 'react-markdown';
import type { VaultItem, VaultItemCategory, VaultSummary } from '@passvault/shared';
import { useAuth } from '../../../hooks/useAuth.js';
import { useVaultShellContext } from '../VaultShell.js';
import { useVault } from '../../../hooks/useVault.js';
import { verifyPassword } from '../../../services/crypto.js';
import { generateSecurePassword } from '../../../lib/password-gen.js';
import { SecretField } from '../SecretField.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ROUTES } from '../../../routes.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function MaskedInput({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
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

function PasswordInput({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
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

function DlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-sm text-muted-foreground font-medium">{label}</dt>
      <dd className="text-sm min-w-0">{children}</dd>
    </>
  );
}

function ItemView({ item, onEdit, onDelete, isExpired }: { item: VaultItem; onEdit: () => void; onDelete: () => void; isExpired: boolean }) {
  const { t } = useTranslation('vault');
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        {item.category === 'note' && (
          <DlRow label={t('text')}>
            {item.format === 'markdown' ? (
              <div className="text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:mb-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:mb-2 [&_a]:text-primary [&_a]:underline [&_hr]:border-border [&_hr]:my-2">
                <Markdown>{item.text}</Markdown>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm">{item.text}</pre>
            )}
          </DlRow>
        )}
        {item.category === 'login' && (<>
          <DlRow label={t('common:username')}><span className="font-mono">{item.username}</span></DlRow>
          <DlRow label={t('common:password')}><SecretField value={item.password} label={t('common:password')} /></DlRow>
          {item.url && <DlRow label={t('url')}><a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{item.url}</a></DlRow>}
        </>)}
        {item.category === 'email' && (<>
          <DlRow label={t('common:email')}><span className="font-mono">{item.emailAddress}</span></DlRow>
          <DlRow label={t('common:password')}><SecretField value={item.password} label={t('common:password')} /></DlRow>
          {item.imapHost && <DlRow label="IMAP">{item.imapHost}{item.imapPort ? `:${item.imapPort}` : ''}</DlRow>}
          {item.smtpHost && <DlRow label="SMTP">{item.smtpHost}{item.smtpPort ? `:${item.smtpPort}` : ''}</DlRow>}
        </>)}
        {item.category === 'credit_card' && (<>
          <DlRow label={t('cardholder')}>{item.cardholderName}</DlRow>
          <DlRow label={t('cardNumber')}><SecretField value={item.cardNumber} label={t('cardNumber')} /></DlRow>
          <DlRow label={t('expiry')}>{item.expiryMonth}/{item.expiryYear}</DlRow>
          <DlRow label="CVV"><SecretField value={item.cvv} label="CVV" /></DlRow>
          {item.pin && <DlRow label="PIN"><SecretField value={item.pin} label="PIN" /></DlRow>}
        </>)}
        {item.category === 'identity' && (<>
          <DlRow label={t('common:name')}>{item.firstName} {item.lastName}</DlRow>
          {item.dateOfBirth && <DlRow label={t('dateOfBirth')}>{item.dateOfBirth}</DlRow>}
          {item.nationality && <DlRow label={t('nationality')}>{item.nationality}</DlRow>}
          {item.passportNumber && <DlRow label={t('passport')}><SecretField value={item.passportNumber} label={t('passport')} /></DlRow>}
          {item.idNumber && <DlRow label={t('idNumber')}><SecretField value={item.idNumber} label={t('idNumber')} /></DlRow>}
          {item.address && <DlRow label={t('address')}><span className="whitespace-pre-wrap">{item.address}</span></DlRow>}
          {item.phone && <DlRow label={t('phone')}>{item.phone}</DlRow>}
        </>)}
        {item.category === 'wifi' && (<>
          <DlRow label={t('ssid')}>{item.ssid}</DlRow>
          <DlRow label={t('common:password')}><SecretField value={item.password} label={t('common:password')} /></DlRow>
          {item.securityType && <DlRow label={t('securityType')}>{item.securityType}</DlRow>}
        </>)}
        {item.category === 'private_key' && (<>
          {item.keyType && <DlRow label={t('keyType')}>{item.keyType}</DlRow>}
          <DlRow label={t('privateKey')}><SecretField value={item.privateKey} label={t('privateKey')} /></DlRow>
          {item.publicKey && <DlRow label={t('publicKey')}><span className="font-mono text-xs break-all">{item.publicKey}</span></DlRow>}
          {item.passphrase && <DlRow label={t('passphrase')}><SecretField value={item.passphrase} label={t('passphrase')} /></DlRow>}
        </>)}
        {item.comment && <DlRow label={t('comment')}><span className="whitespace-pre-wrap">{item.comment}</span></DlRow>}
      </dl>
      {!isExpired && (
        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={onEdit}>{t('common:edit')}</Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>{t('common:delete')}</Button>
        </div>
      )}
    </div>
  );
}

function ItemEditForm({ item, onSave, onCancel }: { item: VaultItem; onSave: (updated: VaultItem) => void; onCancel: () => void }) {
  const { t } = useTranslation('vault');
  const [fields, setFields] = useState<Record<string, string>>(() => flattenItem(item));
  const set = (key: string) => (v: string) => setFields(f => ({ ...f, [key]: v }));
  const get = (key: string, fb = '') => fields[key] ?? fb;

  const handleSave = () => {
    const now = new Date().toISOString();
    const updated = { ...item, ...buildPartial(item.category, fields), name: get('name'), updatedAt: now } as VaultItem;
    onSave(updated);
  };

  return (
    <form onSubmit={e => { e.preventDefault(); handleSave(); }} className="space-y-4">
      <div className="space-y-1"><Label htmlFor="name">{t('common:name')}</Label><Input id="name" value={get('name')} onChange={e => set('name')(e.target.value)} required /></div>
      <CategoryEditFields category={item.category} get={get} set={set} />
      <div className="flex gap-2 pt-2">
        <Button type="submit" size="sm">{t('common:save')}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>{t('common:cancel')}</Button>
      </div>
    </form>
  );
}

function flattenItem(item: VaultItem): Record<string, string> {
  const base: Record<string, string> = { name: item.name };
  switch (item.category) {
    case 'note': return { ...base, format: item.format, text: item.text, comment: item.comment ?? '' };
    case 'login': return { ...base, username: item.username, password: item.password, url: item.url ?? '', totp: item.totp ?? '', comment: item.comment ?? '' };
    case 'email': return { ...base, emailAddress: item.emailAddress, password: item.password, imapHost: item.imapHost ?? '', imapPort: item.imapPort ?? '', smtpHost: item.smtpHost ?? '', smtpPort: item.smtpPort ?? '', comment: item.comment ?? '' };
    case 'credit_card': return { ...base, cardholderName: item.cardholderName, cardNumber: item.cardNumber, expiryMonth: item.expiryMonth, expiryYear: item.expiryYear, cvv: item.cvv, pin: item.pin ?? '', comment: item.comment ?? '' };
    case 'identity': return { ...base, firstName: item.firstName, lastName: item.lastName, dateOfBirth: item.dateOfBirth ?? '', nationality: item.nationality ?? '', passportNumber: item.passportNumber ?? '', idNumber: item.idNumber ?? '', address: item.address ?? '', phone: item.phone ?? '', comment: item.comment ?? '' };
    case 'wifi': return { ...base, ssid: item.ssid, password: item.password, securityType: item.securityType ?? '', comment: item.comment ?? '' };
    case 'private_key': return { ...base, privateKey: item.privateKey, publicKey: item.publicKey ?? '', passphrase: item.passphrase ?? '', keyType: item.keyType ?? '', comment: item.comment ?? '' };
  }
}

function buildPartial(category: VaultItemCategory, f: Record<string, string>): Record<string, unknown> {
  const opt = (v: string) => v.trim() || undefined;
  switch (category) {
    case 'note': return { format: f.format || 'raw', text: f.text || '', comment: opt(f.comment) };
    case 'login': return { username: f.username, password: f.password, url: opt(f.url), totp: opt(f.totp), comment: opt(f.comment) };
    case 'email': return { emailAddress: f.emailAddress, password: f.password, imapHost: opt(f.imapHost), imapPort: opt(f.imapPort), smtpHost: opt(f.smtpHost), smtpPort: opt(f.smtpPort), comment: opt(f.comment) };
    case 'credit_card': return { cardholderName: f.cardholderName, cardNumber: f.cardNumber, expiryMonth: f.expiryMonth, expiryYear: f.expiryYear, cvv: f.cvv, pin: opt(f.pin), comment: opt(f.comment) };
    case 'identity': return { firstName: f.firstName, lastName: f.lastName, dateOfBirth: opt(f.dateOfBirth), nationality: opt(f.nationality), passportNumber: opt(f.passportNumber), idNumber: opt(f.idNumber), address: opt(f.address), phone: opt(f.phone), comment: opt(f.comment) };
    case 'wifi': return { ssid: f.ssid, password: f.password, securityType: opt(f.securityType), comment: opt(f.comment) };
    case 'private_key': return { privateKey: f.privateKey, publicKey: opt(f.publicKey), passphrase: opt(f.passphrase), keyType: opt(f.keyType), comment: opt(f.comment) };
  }
}

function CategoryEditFields({ category, get, set }: { category: VaultItemCategory; get: (k: string, d?: string) => string; set: (k: string) => (v: string) => void }) {
  const { t } = useTranslation('vault');
  switch (category) {
    case 'note': return (
      <>
        <div className="space-y-1">
          <Label>{t('format')}</Label>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={get('format', 'raw')} onChange={e => set('format')(e.target.value)}>
            <option value="raw">{t('plainText')}</option>
            <option value="markdown">{t('markdown')}</option>
          </select>
        </div>
        <div className="space-y-1"><Label htmlFor="text">{t('text')}</Label><Textarea id="text" value={get('text')} onChange={e => set('text')(e.target.value)} rows={8} /></div>
        <div className="space-y-1"><Label htmlFor="comment">{t('comment')}</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
      </>
    );
    case 'login': return (
      <>
        <div className="space-y-1"><Label htmlFor="username">{t('common:username')}</Label><Input id="username" value={get('username')} onChange={e => set('username')(e.target.value)} /></div>
        <PasswordInput id="password" label={t('common:password')} value={get('password')} onChange={set('password')} />
        <div className="space-y-1"><Label htmlFor="url">{t('url')}</Label><Input id="url" value={get('url')} onChange={e => set('url')(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="comment">{t('comment')}</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
      </>
    );
    case 'email': return (
      <>
        <div className="space-y-1"><Label htmlFor="emailAddress">{t('common:emailAddress')}</Label><Input id="emailAddress" value={get('emailAddress')} onChange={e => set('emailAddress')(e.target.value)} /></div>
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
    case 'credit_card': return (
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
    case 'identity': return (
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
        <div className="space-y-1"><Label htmlFor="phone">{t('phone')}</Label><Input id="phone" value={get('phone')} onChange={e => set('phone')(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="comment">{t('comment')}</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
      </>
    );
    case 'wifi': return (
      <>
        <div className="space-y-1"><Label htmlFor="ssid">{t('ssid')}</Label><Input id="ssid" value={get('ssid')} onChange={e => set('ssid')(e.target.value)} /></div>
        <PasswordInput id="password" label={t('common:password')} value={get('password')} onChange={set('password')} />
        <div className="space-y-1"><Label htmlFor="securityType">{t('securityType')}</Label><Input id="securityType" value={get('securityType')} onChange={e => set('securityType')(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="comment">{t('comment')}</Label><Textarea id="comment" value={get('comment')} onChange={e => set('comment')(e.target.value)} rows={3} /></div>
      </>
    );
    case 'private_key': return (
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

export function VaultItemDetailPage() {
  const { t } = useTranslation('vault');
  const { vaultId, itemId } = useParams<{ vaultId: string; itemId: string }>();
  const navigate = useNavigate();
  const { state } = useLocation();
  const vault = (state as { vault?: VaultSummary } | null)?.vault;
  const { token, status } = useAuth();
  const { vaults, resetVaultTimeout } = useVaultShellContext();
  const vaultSalt = vaults.find(v => v.vaultId === vaultId)?.encryptionSalt ?? null;
  const { fetchItem, fetchAllItems, updateItem, deleteItem, rawEncryptedItems } = useVault(vaultId ?? null, token);

  const [item, setItem] = useState<VaultItem | null>(null);
  const [allItems, setAllItems] = useState<VaultItem[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteVerifying, setDeleteVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemLoading, setItemLoading] = useState(true);

  const isExpired = status === 'expired';

  // Fetch the single item on mount (lazy load from items file)
  useEffect(() => {
    if (!vaultId || !itemId) return;
    resetVaultTimeout(vaultId);
    setItemLoading(true);
    fetchItem(itemId).then(fetched => {
      setItem(fetched ?? null);
      setItemLoading(false);
    }).catch(() => {
      setItemLoading(false);
    });
  }, [vaultId, itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch all items only when needed (for save/delete which need the full list)
  const ensureAllItems = async (): Promise<VaultItem[]> => {
    if (allItems) return allItems;
    const items = await fetchAllItems();
    setAllItems(items);
    return items;
  };

  const handleSave = async (updated: VaultItem) => {
    setSaving(true);
    setError(null);
    try {
      const items = await ensureAllItems();
      const newItems = await updateItem(items, updated);
      setAllItems(newItems);
      setItem(newItems.find(i => i.id === updated.id) ?? null);
      setEditing(false);
      if (vaultId) resetVaultTimeout(vaultId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!vaultSalt || !rawEncryptedItems) {
      setDeleteError('Cannot verify password -- vault not loaded.');
      return;
    }
    setDeleteVerifying(true);
    setDeleteError(null);
    try {
      const ok = await verifyPassword(deletePassword, vaultSalt, rawEncryptedItems);
      if (!ok) {
        setDeleteError('Incorrect password.');
        return;
      }
    } catch {
      setDeleteError('Password verification failed.');
      return;
    } finally {
      setDeleteVerifying(false);
    }
    setSaving(true);
    try {
      const items = await ensureAllItems();
      const newItems = await deleteItem(items, item.id);
      setAllItems(newItems);
      if (vaultId) resetVaultTimeout(vaultId);
      navigate(ROUTES.UI.ITEMS(vaultId!), { state: { vault } });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setSaving(false);
      setShowDeleteDialog(false);
      setDeletePassword('');
    }
  };

  if (!item) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate(`/ui/${vaultId}/items`, { state: { vault } })}>
          {t('common:back')}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {itemLoading && <p className="text-sm text-muted-foreground">{t('common:loading')}</p>}
        {!itemLoading && <p className="text-sm text-muted-foreground">{t('itemNotFound')}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate(`/ui/${vaultId}/items`, { state: { vault } })}>
          {t('common:back')}
        </Button>
        <h1 className="text-xl font-semibold truncate">{item.name}</h1>
      </div>

      {isExpired && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-200">
          {t('accountExpiredReadOnly')}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-md border border-border bg-background p-4">
        {editing ? (
          <ItemEditForm
            item={item}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <ItemView
            item={item}
            isExpired={isExpired}
            onEdit={() => { setEditing(true); if (vaultId) resetVaultTimeout(vaultId); }}
            onDelete={() => setShowDeleteDialog(true)}
          />
        )}
      </div>

      {saving && <p className="text-sm text-muted-foreground">{t('common:saving')}</p>}

      <AlertDialog open={showDeleteDialog} onOpenChange={open => { setShowDeleteDialog(open); if (!open) { setDeletePassword(''); setDeleteError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteItemTitle', { name: item.name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteItemDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1 px-1">
            <Label htmlFor="delete-password">{t('common:password')}</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              placeholder={t('yourVaultPassword')}
            />
          </div>
          {deleteError && <p className="text-sm text-destructive px-1">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeletePassword(''); setDeleteError(null); }}>
              {t('common:cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={!deletePassword || deleteVerifying || saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {(deleteVerifying || saving) ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />{t('verifying')}</> : t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
