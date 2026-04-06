import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UpdateUserRequest, UserPlan, UserSummary, UserStatus, UserVaultStub, PreferredLanguage, NotificationPrefs } from '@passvault/shared';
import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';
import { OtpDisplay } from '../OtpDisplay.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowDownTrayIcon, EnvelopeIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline';
import { config } from '../../../config.js';
import { ROUTES } from '../../../routes.js';

const isDev = config.isDev;

const LANGUAGE_LABELS: Record<PreferredLanguage, string> = {
  auto: 'Auto (English)',
  en: 'English',
  de: 'Deutsch',
  fr: 'Fran\u00e7ais',
  ru: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439',
};

// Labels use i18n keys from the admin namespace — see display code below
// This map is only used as a fallback when translation is unavailable
const BACKUP_I18N_KEYS: Record<string, string> = {
  weekly: 'weeklyBackup',
  monthly: 'monthlyBackup',
  quarterly: 'quarterlyBackup',
  none: 'common:off',
};

const statusLabelKey: Record<UserStatus, string> = {
  pending_email_verification: 'statusPendingEmailVerification',
  pending_first_login: 'statusPendingFirstLogin',
  pending_passkey_setup: 'statusPendingPasskeySetup',
  active: 'statusActive',
  locked: 'statusLocked',
  expired: 'statusExpired',
  retired: 'statusRetired',
};

const statusClass: Record<UserStatus, string> = {
  pending_email_verification: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-gray-500/15 text-gray-500 border-gray-500/20',
  pending_first_login: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-600 border-amber-500/20',
  pending_passkey_setup: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-blue-500/15 text-blue-500 border-blue-500/20',
  active: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-green-600/15 text-green-600 border-green-600/20',
  locked: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-red-500/15 text-red-600 border-red-500/20',
  expired: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-orange-500/15 text-orange-600 border-orange-500/20',
  retired: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-gray-400/15 text-gray-500 border-gray-400/20',
};

function formatBytes(bytes: number | null, emptyLabel: string): string {
  if (bytes === null || bytes === 0) return emptyLabel;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ExpiresDisplay({ expiresAt, lifetimeLabel }: { expiresAt?: string | null; lifetimeLabel: string }) {
  if (!expiresAt) return <span className="text-muted-foreground/50">{lifetimeLabel}</span>;
  const isPast = new Date(expiresAt) < new Date();
  return (
    <span className={isPast ? 'text-orange-600 font-medium' : undefined}>
      {expiresAt.slice(0, 10)}
    </span>
  );
}

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { token, userId: currentAdminId } = useAuth();
  const admin = useAdmin(token);
  const { t } = useTranslation('admin');

  const [user, setUser] = useState<UserSummary | null>(
    (location.state as { user?: UserSummary } | null)?.user ?? null,
  );
  const [refreshedOtp, setRefreshedOtp] = useState<{ username: string; oneTimePassword: string } | null>(null);
  const [retireConfirm, setRetireConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [emailedVaultId, setEmailedVaultId] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPlan, setEditPlan] = useState<UserPlan>('free');
  const [editIsPerpetual, setEditIsPerpetual] = useState(false);
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editLanguage, setEditLanguage] = useState<PreferredLanguage>('auto');
  const [editVaultBackup, setEditVaultBackup] = useState<NotificationPrefs['vaultBackup']>('none');
  const [editError, setEditError] = useState<string | null>(null);
  const [downgradeWarning, setDowngradeWarning] = useState(false);

  const handleBack = () => navigate(ROUTES.UI.ADMIN.USERS);

  function startEdit() {
    if (!user) return;
    setEditFirstName(user.firstName ?? '');
    setEditLastName(user.lastName ?? '');
    setEditDisplayName(user.displayName ?? '');
    setEditPlan(user.plan);
    setEditIsPerpetual(user.expiresAt === null || user.expiresAt === undefined);
    setEditExpiresAt(user.expiresAt ? user.expiresAt.slice(0, 10) : '');
    setEditLanguage(user.preferredLanguage ?? 'auto');
    setEditVaultBackup(user.notificationPrefs?.vaultBackup ?? 'none');
    setEditError(null);
    setDowngradeWarning(false);
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!user) return;
    setEditError(null);
    try {
      const req: UpdateUserRequest = {
        userId: user.userId,
        firstName: editFirstName.trim() || null,
        lastName: editLastName.trim() || null,
        displayName: editDisplayName.trim() || null,
        ...(!isSelf && { plan: editPlan }),
        ...(!isSelf && { expiresAt: editIsPerpetual ? null : (editExpiresAt || null) }),
        preferredLanguage: editLanguage,
        notificationPrefs: { vaultBackup: editVaultBackup },
      };
      await admin.updateUser(req);
      setUser(u => u ? {
        ...u,
        firstName: req.firstName,
        lastName: req.lastName,
        displayName: req.displayName,
        plan: req.plan ?? u.plan,
        expiresAt: req.expiresAt,
        preferredLanguage: req.preferredLanguage,
        notificationPrefs: req.notificationPrefs,
      } : u);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  }

  if (!user) {
    return (
      <div>
        <Button variant="ghost" size="sm" className="mb-4" onClick={handleBack}>
          {t('common:back')}
        </Button>
        <p className="text-muted-foreground text-sm">
          {t('userNotFound')}{' '}
          <button className="underline" onClick={handleBack}>
            {t('returnToUsersList')}
          </button>
          .
        </p>
      </div>
    );
  }


  const handleRefreshOtp = async () => {
    const result = await admin.refreshOtp(user.userId);
    setRefreshedOtp(result);
  };

  const handleResetUser = async () => {
    const result = await admin.resetUser(user.userId);
    setRefreshedOtp(result);
    setUser(u => u ? { ...u, status: 'pending_first_login' } : u);
  };

  const handleDelete = async () => {
    await admin.deleteUser(user.userId);
    navigate(ROUTES.UI.ADMIN.USERS, { replace: true });
  };

  const handleLock = async () => {
    await admin.lockUser(user.userId);
    setUser(u => u ? { ...u, status: 'locked' } : u);
  };

  const handleUnlock = async () => {
    await admin.unlockUser(user.userId);
    setUser(u => u ? { ...u, status: 'active' } : u);
  };

  const handleExpire = async () => {
    await admin.expireUser(user.userId);
    setUser(u => u ? { ...u, status: 'expired' } : u);
  };

  const handleRetire = async () => {
    await admin.retireUser(user.userId);
    navigate(ROUTES.UI.ADMIN.USERS, { replace: true });
  };

  const isSelf = user.userId === currentAdminId;
  const isTargetAdmin = user.role === 'admin';

  const displayedName = user.displayName
    || ([user.firstName, user.lastName].filter(Boolean).join(' '))
    || null;

  return (
    <div className="max-w-xl space-y-4">
      <Button variant="ghost" size="sm" onClick={handleBack}>
        {t('common:back')}
      </Button>

      <div className="bg-card rounded-xl border border-border p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            {displayedName && (
              <p className="text-lg font-semibold">{displayedName}</p>
            )}
            <p className="font-mono text-sm text-muted-foreground">{user.username}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={statusClass[user.status]}>
                {t(statusLabelKey[user.status])}
              </span>
              {isTargetAdmin && (
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-purple-500/15 text-purple-600 border-purple-500/20">
                  {t('common:admin')}
                </span>
              )}
              {isSelf && (
                <span className="text-xs text-muted-foreground">(you)</span>
              )}
            </div>
          </div>
          {!editing && (
            <Button variant="outline" size="sm" onClick={startEdit}>
              {t('common:edit')}
            </Button>
          )}
        </div>

        {/* Read-only metadata */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted-foreground">{t('common:plan')}</dt>
          <dd className="capitalize">{user.plan}</dd>
          <dt className="text-muted-foreground">{t('common:expires')}</dt>
          <dd><ExpiresDisplay expiresAt={user.expiresAt} lifetimeLabel={t('common:lifetime')} /></dd>
          <dt className="text-muted-foreground">{t('common:created')}</dt>
          <dd>{new Date(user.createdAt).toISOString().slice(0, 10)}</dd>
          <dt className="text-muted-foreground">{t('common:lastLogin')}</dt>
          <dd>
            {user.lastLoginAt
              ? new Date(user.lastLoginAt).toISOString().slice(0, 10)
              : '—'}
          </dd>
          <dt className="text-muted-foreground">{t('language')}</dt>
          <dd>{LANGUAGE_LABELS[user.preferredLanguage ?? 'auto']}</dd>
          <dt className="text-muted-foreground">{t('vaultBackup')}</dt>
          <dd>{user.notificationPrefs?.vaultBackup ? t(BACKUP_I18N_KEYS[user.notificationPrefs.vaultBackup] ?? 'common:off') : t('notConfigured')}</dd>
          <dt className="text-muted-foreground">{t('lastBackupSent')}</dt>
          <dd>{user.lastBackupSentAt ? new Date(user.lastBackupSentAt).toISOString().slice(0, 10) : t('common:never')}</dd>
          <dt className="text-muted-foreground">{t('common:userId')}</dt>
          <dd className="font-mono text-xs text-muted-foreground break-all">{user.userId}</dd>
        </dl>

        {/* Inline edit form */}
        {editing && (
          <div className="border-t border-border pt-4 space-y-4">
            <p className="text-sm font-medium">{t('editProfile')}</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-first">{t('common:firstName')}</Label>
                <Input
                  id="edit-first"
                  value={editFirstName}
                  onChange={e => setEditFirstName(e.target.value)}
                  placeholder="Jane"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-last">{t('common:lastName')}</Label>
                <Input
                  id="edit-last"
                  value={editLastName}
                  onChange={e => setEditLastName(e.target.value)}
                  placeholder="Smith"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-display">
                {t('common:displayName')} <span className="text-muted-foreground font-normal">({t('common:optional')})</span>
              </Label>
              <Input
                id="edit-display"
                value={editDisplayName}
                onChange={e => setEditDisplayName(e.target.value)}
                placeholder="Defaults to first + last name"
              />
            </div>

            {!isSelf && (
              <div className="space-y-1">
                <Label>{t('common:plan')}</Label>
                <div className="flex gap-2">
                  {(['free', 'pro', 'administrator'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        const wasAdmin = user.plan === 'administrator';
                        setEditPlan(p);
                        setDowngradeWarning(wasAdmin && p !== 'administrator');
                      }}
                      className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${editPlan === p ? (p === 'administrator' ? 'border-purple-500 bg-purple-500/10 text-purple-600 font-medium' : 'border-primary bg-primary/10 text-primary font-medium') : 'border-border text-muted-foreground hover:border-primary/50'}`}
                    >
                      {p === 'administrator' ? t('common:admin') : p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
                {downgradeWarning && (
                  <p className="text-xs text-destructive mt-1">
                    {t('downgradeWarning')}
                  </p>
                )}
              </div>
            )}

            {!isSelf && (
              <div className="space-y-2">
                <Label htmlFor="edit-expires">{t('expirationDate')}</Label>
                <Input
                  id="edit-expires"
                  type="date"
                  value={editExpiresAt}
                  onChange={e => setEditExpiresAt(e.target.value)}
                  disabled={editIsPerpetual}
                />
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editIsPerpetual}
                  onChange={e => setEditIsPerpetual(e.target.checked)}
                  className="rounded"
                />
                {t('common:lifetimeNeverExpires')}
              </label>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="edit-language">{t('language')}</Label>
              <select
                id="edit-language"
                value={editLanguage}
                onChange={e => setEditLanguage(e.target.value as PreferredLanguage)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {(Object.entries(LANGUAGE_LABELS) as [PreferredLanguage, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label>{t('vaultBackup')}</Label>
              <Select
                value={editVaultBackup}
                onValueChange={v => setEditVaultBackup(v as NotificationPrefs['vaultBackup'])}
              >
                <SelectTrigger>
                  <span>{t(BACKUP_I18N_KEYS[editVaultBackup] ?? 'off')}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common:off')}</SelectItem>
                  <SelectItem value="weekly">{t('weeklyBackup')}</SelectItem>
                  <SelectItem value="monthly">{t('monthlyBackup')}</SelectItem>
                  <SelectItem value="quarterly">{t('quarterlyBackup')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editError && <p className="text-sm text-destructive">{editError}</p>}

            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit} disabled={admin.loading}>
                {admin.loading ? t('common:saving') : t('common:save')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                {t('common:cancel')}
              </Button>
            </div>
          </div>
        )}

        {admin.error && !editing && <p className="text-destructive text-sm">{admin.error}</p>}

        {/* Actions */}
        <div className="border-t border-border pt-4 flex flex-wrap gap-2">
          {user.status === 'pending_first_login' && (
            <Button variant="ghost" size="sm" onClick={handleRefreshOtp} disabled={admin.loading}>
              {t('refreshOtp')}
            </Button>
          )}

          {user.status !== 'pending_first_login' && user.status !== 'retired' && !isSelf && (
            resetConfirm ? (
              <>
                <div className="w-full text-xs text-destructive mb-1">
                  {t('resetWarning')}
                </div>
                <Button variant="destructive" size="sm" onClick={() => { setResetConfirm(false); handleResetUser(); }} disabled={admin.loading}>
                  {t('confirmReset')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setResetConfirm(false)}>
                  {t('common:cancel')}
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setResetConfirm(true)} disabled={admin.loading}>
                {t('resetLogin')}
              </Button>
            )
          )}

          {user.status === 'active' && !isSelf && (
            <Button variant="outline" size="sm" onClick={handleLock} disabled={admin.loading}>
              {t('lock')}
            </Button>
          )}

          {user.status === 'locked' && !isSelf && (
            <Button variant="outline" size="sm" onClick={handleUnlock} disabled={admin.loading}>
              {t('unlock')}
            </Button>
          )}

          {(user.status === 'active' || user.status === 'locked') && !isSelf && !isTargetAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="text-orange-600 border-orange-300 hover:bg-orange-50 hover:text-orange-700"
              onClick={handleExpire}
              disabled={admin.loading}
            >
              {t('expire')}
            </Button>
          )}

          {user.status !== 'retired' && !isSelf && (
            retireConfirm ? (
              <>
                <Button variant="destructive" size="sm" onClick={handleRetire} disabled={admin.loading}>
                  {t('confirmRetire')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRetireConfirm(false)}>
                  {t('common:cancel')}
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setRetireConfirm(true)}
                disabled={admin.loading}
              >
                {t('retireUser')}
              </Button>
            )
          )}

          {user.status === 'pending_first_login' && (
            deleteConfirm ? (
              <>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={admin.loading}>
                  {t('confirmDelete')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)}>
                  {t('common:cancel')}
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteConfirm(true)}
              >
                {t('deleteUser')}
              </Button>
            )
          )}
        </div>
      </div>

      {/* Vault cards */}
      {user.vaults.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-6 flex items-center gap-3 text-muted-foreground text-sm">
          <ArchiveBoxIcon className="h-5 w-5 shrink-0" />
          {t('noVaults')}
        </div>
      ) : (
        user.vaults.map((vault: UserVaultStub) => (
          <VaultCard
            key={vault.vaultId}
            vault={vault}
            userId={user.userId}
            username={user.username}
            emailedVaultId={emailedVaultId}
            onDownload={(vaultId) => admin.downloadUserVault(user.userId, user.username, vaultId)}
            onEmail={async (vaultId) => {
              await admin.emailUserVault(user.userId, vaultId);
              setEmailedVaultId(vaultId);
              setTimeout(() => setEmailedVaultId(null), 4000);
            }}
            loading={admin.loading}
          />
        ))
      )}

      <Dialog open={refreshedOtp !== null} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('oneTimePassword')}</DialogTitle>
          </DialogHeader>
          {refreshedOtp && (
            <OtpDisplay
              username={refreshedOtp.username}
              oneTimePassword={refreshedOtp.oneTimePassword}
              onDone={() => setRefreshedOtp(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface VaultCardProps {
  vault: UserVaultStub;
  userId: string;
  username: string;
  emailedVaultId: string | null;
  onDownload: (vaultId: string) => void;
  onEmail: (vaultId: string) => Promise<void>;
  loading: boolean;
}

function VaultCard({ vault, emailedVaultId, onDownload, onEmail, loading }: VaultCardProps) {
  const { t } = useTranslation('admin');
  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ArchiveBoxIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm">{vault.displayName}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{formatBytes(vault.sizeBytes, t('empty'))}</span>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDownload(vault.vaultId)}
          disabled={loading}
        >
          <ArrowDownTrayIcon className="mr-1.5 h-3.5 w-3.5" />
          {t('common:download')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isDev || loading}
          onClick={() => onEmail(vault.vaultId)}
          title={isDev ? t('emailDisabledInDev') : undefined}
        >
          <EnvelopeIcon className="mr-1.5 h-3.5 w-3.5" />
          {emailedVaultId === vault.vaultId ? t('sent') : t('emailToUser')}
        </Button>
      </div>
    </div>
  );
}
