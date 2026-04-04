import { useEffect, useState } from 'react';
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

function PasswordInput({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
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

function DlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-sm text-muted-foreground font-medium">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </>
  );
}

function ItemView({ item, onEdit, onDelete, isExpired }: { item: VaultItem; onEdit: () => void; onDelete: () => void; isExpired: boolean }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        {item.category === 'note' && (
          <DlRow label="Text">
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
          <DlRow label="Username"><span className="font-mono">{item.username}</span></DlRow>
          <DlRow label="Password"><SecretField value={item.password} label="Password" /></DlRow>
          {item.url && <DlRow label="URL"><a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{item.url}</a></DlRow>}
          {item.notes && <DlRow label="Notes"><span className="whitespace-pre-wrap">{item.notes}</span></DlRow>}
        </>)}
        {item.category === 'email' && (<>
          <DlRow label="Email"><span className="font-mono">{item.emailAddress}</span></DlRow>
          <DlRow label="Password"><SecretField value={item.password} label="Password" /></DlRow>
          {item.imapHost && <DlRow label="IMAP">{item.imapHost}{item.imapPort ? `:${item.imapPort}` : ''}</DlRow>}
          {item.smtpHost && <DlRow label="SMTP">{item.smtpHost}{item.smtpPort ? `:${item.smtpPort}` : ''}</DlRow>}
          {item.notes && <DlRow label="Notes"><span className="whitespace-pre-wrap">{item.notes}</span></DlRow>}
        </>)}
        {item.category === 'credit_card' && (<>
          <DlRow label="Cardholder">{item.cardholderName}</DlRow>
          <DlRow label="Card number"><SecretField value={item.cardNumber} label="Card number" /></DlRow>
          <DlRow label="Expiry">{item.expiryMonth}/{item.expiryYear}</DlRow>
          <DlRow label="CVV"><SecretField value={item.cvv} label="CVV" /></DlRow>
          {item.pin && <DlRow label="PIN"><SecretField value={item.pin} label="PIN" /></DlRow>}
          {item.notes && <DlRow label="Notes"><span className="whitespace-pre-wrap">{item.notes}</span></DlRow>}
        </>)}
        {item.category === 'identity' && (<>
          <DlRow label="Name">{item.firstName} {item.lastName}</DlRow>
          {item.dateOfBirth && <DlRow label="Date of birth">{item.dateOfBirth}</DlRow>}
          {item.nationality && <DlRow label="Nationality">{item.nationality}</DlRow>}
          {item.passportNumber && <DlRow label="Passport"><SecretField value={item.passportNumber} label="Passport" /></DlRow>}
          {item.idNumber && <DlRow label="ID number"><SecretField value={item.idNumber} label="ID number" /></DlRow>}
          {item.address && <DlRow label="Address"><span className="whitespace-pre-wrap">{item.address}</span></DlRow>}
          {item.phone && <DlRow label="Phone">{item.phone}</DlRow>}
        </>)}
        {item.category === 'wifi' && (<>
          <DlRow label="SSID">{item.ssid}</DlRow>
          <DlRow label="Password"><SecretField value={item.password} label="Password" /></DlRow>
          {item.securityType && <DlRow label="Security">{item.securityType}</DlRow>}
          {item.notes && <DlRow label="Notes"><span className="whitespace-pre-wrap">{item.notes}</span></DlRow>}
        </>)}
        {item.category === 'private_key' && (<>
          {item.keyType && <DlRow label="Key type">{item.keyType}</DlRow>}
          <DlRow label="Private key"><SecretField value={item.privateKey} label="Private key" /></DlRow>
          {item.publicKey && <DlRow label="Public key"><span className="font-mono text-xs break-all">{item.publicKey}</span></DlRow>}
          {item.passphrase && <DlRow label="Passphrase"><SecretField value={item.passphrase} label="Passphrase" /></DlRow>}
        </>)}
      </dl>
      {!isExpired && (
        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>
        </div>
      )}
    </div>
  );
}

function ItemEditForm({ item, onSave, onCancel }: { item: VaultItem; onSave: (updated: VaultItem) => void; onCancel: () => void }) {
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
      <div className="space-y-1"><Label htmlFor="name">Name</Label><Input id="name" value={get('name')} onChange={e => set('name')(e.target.value)} required /></div>
      <CategoryEditFields category={item.category} get={get} set={set} />
      <div className="flex gap-2 pt-2">
        <Button type="submit" size="sm">Save</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function flattenItem(item: VaultItem): Record<string, string> {
  const base: Record<string, string> = { name: item.name };
  switch (item.category) {
    case 'note': return { ...base, format: item.format, text: item.text };
    case 'login': return { ...base, username: item.username, password: item.password, url: item.url ?? '', totp: item.totp ?? '', notes: item.notes ?? '' };
    case 'email': return { ...base, emailAddress: item.emailAddress, password: item.password, imapHost: item.imapHost ?? '', imapPort: item.imapPort ?? '', smtpHost: item.smtpHost ?? '', smtpPort: item.smtpPort ?? '', notes: item.notes ?? '' };
    case 'credit_card': return { ...base, cardholderName: item.cardholderName, cardNumber: item.cardNumber, expiryMonth: item.expiryMonth, expiryYear: item.expiryYear, cvv: item.cvv, pin: item.pin ?? '', notes: item.notes ?? '' };
    case 'identity': return { ...base, firstName: item.firstName, lastName: item.lastName, dateOfBirth: item.dateOfBirth ?? '', nationality: item.nationality ?? '', passportNumber: item.passportNumber ?? '', idNumber: item.idNumber ?? '', address: item.address ?? '', phone: item.phone ?? '', notes: item.notes ?? '' };
    case 'wifi': return { ...base, ssid: item.ssid, password: item.password, securityType: item.securityType ?? '', notes: item.notes ?? '' };
    case 'private_key': return { ...base, privateKey: item.privateKey, publicKey: item.publicKey ?? '', passphrase: item.passphrase ?? '', keyType: item.keyType ?? '', notes: item.notes ?? '' };
  }
}

function buildPartial(category: VaultItemCategory, f: Record<string, string>): Record<string, unknown> {
  const opt = (v: string) => v.trim() || undefined;
  switch (category) {
    case 'note': return { format: f.format || 'raw', text: f.text || '' };
    case 'login': return { username: f.username, password: f.password, url: opt(f.url), totp: opt(f.totp), notes: opt(f.notes) };
    case 'email': return { emailAddress: f.emailAddress, password: f.password, imapHost: opt(f.imapHost), imapPort: opt(f.imapPort), smtpHost: opt(f.smtpHost), smtpPort: opt(f.smtpPort), notes: opt(f.notes) };
    case 'credit_card': return { cardholderName: f.cardholderName, cardNumber: f.cardNumber, expiryMonth: f.expiryMonth, expiryYear: f.expiryYear, cvv: f.cvv, pin: opt(f.pin), notes: opt(f.notes) };
    case 'identity': return { firstName: f.firstName, lastName: f.lastName, dateOfBirth: opt(f.dateOfBirth), nationality: opt(f.nationality), passportNumber: opt(f.passportNumber), idNumber: opt(f.idNumber), address: opt(f.address), phone: opt(f.phone), notes: opt(f.notes) };
    case 'wifi': return { ssid: f.ssid, password: f.password, securityType: opt(f.securityType), notes: opt(f.notes) };
    case 'private_key': return { privateKey: f.privateKey, publicKey: opt(f.publicKey), passphrase: opt(f.passphrase), keyType: opt(f.keyType), notes: opt(f.notes) };
  }
}

function CategoryEditFields({ category, get, set }: { category: VaultItemCategory; get: (k: string, d?: string) => string; set: (k: string) => (v: string) => void }) {
  switch (category) {
    case 'note': return (
      <>
        <div className="space-y-1">
          <Label>Format</Label>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={get('format', 'raw')} onChange={e => set('format')(e.target.value)}>
            <option value="raw">Plain text</option>
            <option value="markdown">Markdown</option>
          </select>
        </div>
        <div className="space-y-1"><Label htmlFor="text">Text</Label><Textarea id="text" value={get('text')} onChange={e => set('text')(e.target.value)} rows={8} /></div>
      </>
    );
    case 'login': return (
      <>
        <div className="space-y-1"><Label htmlFor="username">Username</Label><Input id="username" value={get('username')} onChange={e => set('username')(e.target.value)} /></div>
        <PasswordInput id="password" label="Password" value={get('password')} onChange={set('password')} />
        <div className="space-y-1"><Label htmlFor="url">URL</Label><Input id="url" value={get('url')} onChange={e => set('url')(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="notes">Notes</Label><Textarea id="notes" value={get('notes')} onChange={e => set('notes')(e.target.value)} rows={3} /></div>
      </>
    );
    case 'email': return (
      <>
        <div className="space-y-1"><Label htmlFor="emailAddress">Email address</Label><Input id="emailAddress" value={get('emailAddress')} onChange={e => set('emailAddress')(e.target.value)} /></div>
        <PasswordInput id="password" label="Password" value={get('password')} onChange={set('password')} />
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label htmlFor="imapHost">IMAP host</Label><Input id="imapHost" value={get('imapHost')} onChange={e => set('imapHost')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="imapPort">IMAP port</Label><Input id="imapPort" value={get('imapPort')} onChange={e => set('imapPort')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="smtpHost">SMTP host</Label><Input id="smtpHost" value={get('smtpHost')} onChange={e => set('smtpHost')(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="smtpPort">SMTP port</Label><Input id="smtpPort" value={get('smtpPort')} onChange={e => set('smtpPort')(e.target.value)} /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="notes">Notes</Label><Textarea id="notes" value={get('notes')} onChange={e => set('notes')(e.target.value)} rows={3} /></div>
      </>
    );
    case 'credit_card': return (
      <>
        <div className="space-y-1"><Label htmlFor="cardholderName">Cardholder name</Label><Input id="cardholderName" value={get('cardholderName')} onChange={e => set('cardholderName')(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="cardNumber">Card number</Label><Input id="cardNumber" value={get('cardNumber')} onChange={e => set('cardNumber')(e.target.value)} /></div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1"><Label htmlFor="expiryMonth">MM</Label><Input id="expiryMonth" value={get('expiryMonth')} onChange={e => set('expiryMonth')(e.target.value)} maxLength={2} /></div>
          <div className="space-y-1"><Label htmlFor="expiryYear">YYYY</Label><Input id="expiryYear" value={get('expiryYear')} onChange={e => set('expiryYear')(e.target.value)} maxLength={4} /></div>
          <MaskedInput id="cvv" label="CVV" value={get('cvv')} onChange={set('cvv')} />
        </div>
        <MaskedInput id="pin" label="PIN" value={get('pin')} onChange={set('pin')} />
      </>
    );
    case 'identity': return (
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
        <div className="space-y-1"><Label htmlFor="phone">Phone</Label><Input id="phone" value={get('phone')} onChange={e => set('phone')(e.target.value)} /></div>
      </>
    );
    case 'wifi': return (
      <>
        <div className="space-y-1"><Label htmlFor="ssid">SSID</Label><Input id="ssid" value={get('ssid')} onChange={e => set('ssid')(e.target.value)} /></div>
        <PasswordInput id="password" label="Password" value={get('password')} onChange={set('password')} />
        <div className="space-y-1"><Label htmlFor="securityType">Security type</Label><Input id="securityType" value={get('securityType')} onChange={e => set('securityType')(e.target.value)} /></div>
      </>
    );
    case 'private_key': return (
      <>
        <div className="space-y-1"><Label htmlFor="keyType">Key type</Label><Input id="keyType" value={get('keyType')} onChange={e => set('keyType')(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="privateKey">Private key</Label><Textarea id="privateKey" value={get('privateKey')} onChange={e => set('privateKey')(e.target.value)} rows={5} className="font-mono text-xs" /></div>
        <div className="space-y-1"><Label htmlFor="publicKey">Public key</Label><Textarea id="publicKey" value={get('publicKey')} onChange={e => set('publicKey')(e.target.value)} rows={3} className="font-mono text-xs" /></div>
        <PasswordInput id="passphrase" label="Passphrase" value={get('passphrase')} onChange={set('passphrase')} />
      </>
    );
  }
}

export function VaultItemDetailPage() {
  const { vaultId, itemId } = useParams<{ vaultId: string; itemId: string }>();
  const navigate = useNavigate();
  const { state } = useLocation();
  const vault = (state as { vault?: VaultSummary } | null)?.vault;
  const { token, status } = useAuth();
  const { vaults } = useVaultShellContext();
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
          &larr; Back
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {itemLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!itemLoading && <p className="text-sm text-muted-foreground">Item not found.</p>}
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate(`/ui/${vaultId}/items`, { state: { vault } })}>
          &larr; Back
        </Button>
        <h1 className="text-xl font-semibold truncate">{item.name}</h1>
      </div>

      {isExpired && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-200">
          Your account has expired — vault is read-only.
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
            onEdit={() => setEditing(true)}
            onDelete={() => setShowDeleteDialog(true)}
          />
        )}
      </div>

      {saving && <p className="text-sm text-muted-foreground">Saving...</p>}

      <AlertDialog open={showDeleteDialog} onOpenChange={open => { setShowDeleteDialog(open); if (!open) { setDeletePassword(''); setDeleteError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{item.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Enter your password to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1 px-1">
            <Label htmlFor="delete-password">Password</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={e => setDeletePassword(e.target.value)}
              placeholder="Your vault password"
            />
          </div>
          {deleteError && <p className="text-sm text-destructive px-1">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeletePassword(''); setDeleteError(null); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={!deletePassword || deleteVerifying || saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {(deleteVerifying || saving) ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Verifying...</> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
