import { useMemo, useState, useCallback } from 'react';
import type { ColumnDef, SortingFn } from '@tanstack/react-table';
import type { UserSummary, UserStatus, UserPlan, UserVaultStub } from '@passvault/shared';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  TrashIcon,
  InboxIcon,
  EllipsisHorizontalIcon,
  PlusCircleIcon,
  XMarkIcon,
  LockClosedIcon,
  LockOpenIcon,
  EnvelopeIcon,
  UserIcon,
  ClockIcon,
  ArrowUturnUpIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DateRangeFilter } from './DateRangeFilter.js';
import { DataTable } from './DataTable.js';
import { config } from '../../config.js';

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return 'empty';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function defaultExpiresAt(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Returns true when a date string (YYYY-MM-DD or ISO) is in the past */
function isPastDate(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

interface UserListProps {
  users: UserSummary[];
  loading: boolean;
  onDownload: (userId: string, username: string, vaultId?: string) => void;
  onRefreshOtp: (userId: string) => Promise<{ username: string; oneTimePassword: string }>;
  onDeleteUser: (userId: string) => Promise<void>;
  onLockUser: (userId: string) => Promise<void>;
  onUnlockUser: (userId: string) => Promise<void>;
  onExpireUser: (userId: string) => Promise<void>;
  onReactivateUser: (userId: string, expiresAt: string | null) => Promise<void>;
  onEmailVault: (userId: string) => Promise<void>;
  onResetUser: (userId: string) => Promise<{ username: string; oneTimePassword: string }>;
  onOtpRefreshed?: (result: { username: string; oneTimePassword: string }) => void;
  onRowClick?: (user: UserSummary) => void;
}

const ALL_STATUSES: UserStatus[] = [
  'active', 'expired', 'locked',
  'pending_first_login', 'pending_passkey_setup', 'pending_email_verification',
];

const ALL_PLANS: UserPlan[] = ['free', 'pro', 'administrator'];

const planLabel: Record<UserPlan, string> = { free: 'Free', pro: 'Pro', administrator: 'Administrator' };

const planPill: Record<UserPlan, string> = {
  free: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  pro: 'bg-blue-500/10 text-blue-600',
  administrator: 'bg-purple-500/10 text-purple-600',
};

const statusLabel: Record<UserStatus, string> = {
  pending_email_verification: 'Awaiting email verification',
  pending_first_login: 'Awaiting first login',
  pending_passkey_setup: 'Awaiting passkey setup',
  active: 'Active',
  locked: 'Locked',
  expired: 'Expired',
  retired: 'Retired',
};

const statusDot: Record<UserStatus, string> = {
  pending_email_verification: 'bg-gray-400',
  pending_first_login: 'bg-amber-500',
  pending_passkey_setup: 'bg-blue-500',
  active: 'bg-green-600',
  locked: 'bg-red-500',
  expired: 'bg-orange-500',
  retired: 'bg-gray-300',
};

const statusPill: Record<UserStatus, string> = {
  pending_email_verification: 'bg-gray-400/15 text-gray-500',
  pending_first_login: 'bg-amber-500/15 text-amber-600',
  pending_passkey_setup: 'bg-blue-500/15 text-blue-500',
  active: 'bg-green-600/15 text-green-600',
  locked: 'bg-red-500/15 text-red-600',
  expired: 'bg-orange-500/15 text-orange-600',
  retired: 'bg-gray-400/15 text-gray-500',
};

// Null-last sort for lastLoginAt
const nullLastSortFn: SortingFn<UserSummary> = (rowA, rowB, columnId) => {
  const a = rowA.getValue<string | null>(columnId);
  const b = rowB.getValue<string | null>(columnId);
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
};

function applyFilters(
  users: UserSummary[],
  statuses: Set<UserStatus>,
  plans: Set<UserPlan>,
  username: string,
  createdFrom: string,
  createdTo: string,
  lastLoginFrom: string,
  lastLoginTo: string,
): UserSummary[] {
  return users.filter((u) => {
    if (statuses.size > 0 && !statuses.has(u.status)) return false;
    if (plans.size > 0 && !plans.has(u.plan)) return false;
    if (username && !u.username.toLowerCase().includes(username.toLowerCase())) return false;
    const created = u.createdAt.slice(0, 10);
    if (createdFrom && created < createdFrom) return false;
    if (createdTo && created > createdTo) return false;
    if (lastLoginFrom || lastLoginTo) {
      const ll = u.lastLoginAt ? u.lastLoginAt.slice(0, 10) : null;
      if (!ll) return false;
      if (lastLoginFrom && ll < lastLoginFrom) return false;
      if (lastLoginTo && ll > lastLoginTo) return false;
    }
    return true;
  });
}

function ExpiresCell({ expiresAt }: { expiresAt?: string | null }) {
  if (!expiresAt) {
    return <span className="text-muted-foreground/50 text-xs tabular-nums">♾ lifetime</span>;
  }
  const past = isPastDate(expiresAt);
  return (
    <span className={`text-xs tabular-nums ${past ? 'text-orange-500' : 'text-muted-foreground'}`}>
      {expiresAt.slice(0, 10)}
    </span>
  );
}

function getUserColumns(
  onDownload: UserListProps['onDownload'],
  onPickVault: (user: UserSummary) => void,
  onRefreshOtp: (userId: string) => Promise<void>,
  onSetResetTarget: (user: UserSummary) => void,
  onDeleteUser: (user: UserSummary) => void,
  onSetLockTarget: (user: UserSummary) => void,
  onSetUnlockTarget: (user: UserSummary) => void,
  onSetExpireTarget: (user: UserSummary) => void,
  onSetReactivateTarget: (user: UserSummary) => void,
  onEmailVault: (userId: string) => void,
  onShowUser: ((user: UserSummary) => void) | undefined,
  actionLoading: string | null,
  isProd: boolean,
): ColumnDef<UserSummary>[] {
  const cols: ColumnDef<UserSummary>[] = [
    {
      accessorKey: 'username',
      header: 'Username',
      size: 144,
      cell: ({ row }) => (
        <span className="font-mono">{row.original.username}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 176,
      sortingFn: (rowA, rowB) =>
        statusLabel[rowA.original.status].localeCompare(statusLabel[rowB.original.status]),
      cell: ({ row }) => (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusPill[row.original.status]}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[row.original.status]}`} />
          {statusLabel[row.original.status]}
        </span>
      ),
    },
    {
      accessorKey: 'plan',
      header: 'Plan',
      size: 72,
      sortingFn: (rowA, rowB) => rowA.original.plan.localeCompare(rowB.original.plan),
      cell: ({ row }) => (
        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${planPill[row.original.plan]}`}>
          {planLabel[row.original.plan]}
        </span>
      ),
    },
  ];

  cols.push(
    {
      accessorKey: 'createdAt',
      header: 'Created',
      size: 112,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {new Date(row.original.createdAt).toISOString().slice(0, 10)}
        </span>
      ),
    },
    {
      accessorKey: 'lastLoginAt',
      header: 'Last login',
      size: 112,
      sortingFn: nullLastSortFn,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.lastLoginAt
            ? new Date(row.original.lastLoginAt).toISOString().slice(0, 10)
            : '—'}
        </span>
      ),
    },
    {
      id: 'expiresAt',
      accessorKey: 'expiresAt',
      header: 'Expires',
      size: 112,
      sortingFn: nullLastSortFn,
      cell: ({ row }) => <ExpiresCell expiresAt={row.original.expiresAt} />,
    },
    {
      accessorKey: 'vaultSizeBytes',
      header: 'Vault',
      size: 80,
      cell: ({ row }) => (
        <span className="text-muted-foreground tabular-nums">
          {formatBytes(row.original.vaultSizeBytes)}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      size: 40,
      cell: ({ row }) => {
        const user = row.original;
        const canExpire = user.status === 'active' || user.status === 'locked';
        return (
          <div onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.username}`} />
              }>
                <EllipsisHorizontalIcon className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* 1. Lock user — only shown when active */}
                {user.status === 'active' && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onSetLockTarget(user)}
                  >
                    <LockClosedIcon className="mr-2 h-4 w-4" />
                    lock
                  </DropdownMenuItem>
                )}

                {/* 2. Unlock user — only shown when locked */}
                {user.status === 'locked' && (
                  <DropdownMenuItem
                    className="text-green-600 focus:text-green-600"
                    onClick={() => onSetUnlockTarget(user)}
                  >
                    <LockOpenIcon className="mr-2 h-4 w-4" />
                    unlock
                  </DropdownMenuItem>
                )}

                {/* Expire — only for active or locked */}
                {canExpire && (
                  <DropdownMenuItem
                    className="text-orange-600 focus:text-orange-600"
                    onClick={() => onSetExpireTarget(user)}
                  >
                    <ClockIcon className="mr-2 h-4 w-4" />
                    expire
                  </DropdownMenuItem>
                )}

                {/* Reactivate — only for expired users */}
                {user.status === 'expired' && (
                  <DropdownMenuItem
                    className="text-green-600 focus:text-green-600"
                    onClick={() => onSetReactivateTarget(user)}
                  >
                    <ArrowUturnUpIcon className="mr-2 h-4 w-4" />
                    reactivate
                  </DropdownMenuItem>
                )}

                {(user.status === 'active' || user.status === 'locked' || canExpire || user.status === 'expired') && (
                  <DropdownMenuSeparator />
                )}

                {/* 3. Download vault — hidden when user has no vaults */}
                {user.vaultCount > 0 && (
                  <DropdownMenuItem onClick={() => {
                    if (user.vaultCount === 1) {
                      onDownload(user.userId, user.username, user.vaults[0].vaultId);
                    } else {
                      onPickVault(user);
                    }
                  }}>
                    <ArrowDownTrayIcon className="mr-2 h-4 w-4" />
                    download vault
                  </DropdownMenuItem>
                )}

                {/* 4. Email vault — disabled in dev/beta */}
                <DropdownMenuItem
                  disabled={!isProd}
                  onClick={() => { if (isProd) onEmailVault(user.userId); }}
                >
                  <EnvelopeIcon className="mr-2 h-4 w-4" />
                  email vault
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* 5. Show user details */}
                <DropdownMenuItem onClick={() => onShowUser?.(user)}>
                  <UserIcon className="mr-2 h-4 w-4" />
                  user details
                </DropdownMenuItem>

                {/* Refresh OTP + delete — only for pending_first_login */}
                {user.status === 'pending_first_login' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onRefreshOtp(user.userId)}
                      disabled={actionLoading === user.userId + ':refresh'}
                    >
                      <ArrowPathIcon className="mr-2 h-4 w-4" />
                      refresh OTP
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDeleteUser(user)}
                    >
                      <TrashIcon className="mr-2 h-4 w-4" />
                      delete user
                    </DropdownMenuItem>
                  </>
                )}

                {/* Reset user — available for non-pending, non-retired users */}
                {user.status !== 'pending_first_login' && user.status !== 'retired' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onSetResetTarget(user)}>
                      <ArrowPathIcon className="mr-2 h-4 w-4" />
                      reset login
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  );

  return cols;
}

export function UserList({ users, loading, onDownload, onRefreshOtp, onResetUser, onDeleteUser, onLockUser, onUnlockUser, onExpireUser, onReactivateUser, onEmailVault, onOtpRefreshed, onRowClick }: UserListProps) {
  const [selectedStatuses, setSelectedStatuses] = useState<Set<UserStatus>>(new Set());
  const [selectedPlans, setSelectedPlans] = useState<Set<UserPlan>>(new Set());
  const [usernameFilter, setUsernameFilter] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [lastLoginFrom, setLastLoginFrom] = useState('');
  const [lastLoginTo, setLastLoginTo] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserSummary | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [lockTarget, setLockTarget] = useState<UserSummary | null>(null);
  const [lockLoading, setLockLoading] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<UserSummary | null>(null);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [expireTarget, setExpireTarget] = useState<UserSummary | null>(null);
  const [expireLoading, setExpireLoading] = useState(false);
  const [reactivateTarget, setReactivateTarget] = useState<UserSummary | null>(null);
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [reactivateDate, setReactivateDate] = useState(defaultExpiresAt());
  const [reactivatePerpetual, setReactivatePerpetual] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [vaultPickerUser, setVaultPickerUser] = useState<UserSummary | null>(null);

  const isProd = config.isProd;

  const handlePickVault = useCallback((user: UserSummary) => {
    setVaultPickerUser(user);
  }, []);

  function toggleStatus(status: UserStatus) {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function togglePlan(plan: UserPlan) {
    setSelectedPlans(prev => {
      const next = new Set(prev);
      if (next.has(plan)) next.delete(plan);
      else next.add(plan);
      return next;
    });
  }

  async function handleRefreshOtp(userId: string) {
    setActionLoading(userId + ':refresh');
    try {
      const result = await onRefreshOtp(userId);
      onOtpRefreshed?.(result);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResetConfirm() {
    if (!resetTarget) return;
    setResetLoading(true);
    try {
      const result = await onResetUser(resetTarget.userId);
      onOtpRefreshed?.(result);
      setResetTarget(null);
    } finally {
      setResetLoading(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await onDeleteUser(deleteTarget.userId);
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleLockConfirm() {
    if (!lockTarget) return;
    setLockLoading(true);
    try {
      await onLockUser(lockTarget.userId);
      setLockTarget(null);
    } finally {
      setLockLoading(false);
    }
  }

  async function handleUnlockConfirm() {
    if (!unlockTarget) return;
    setUnlockLoading(true);
    try {
      await onUnlockUser(unlockTarget.userId);
      setUnlockTarget(null);
    } finally {
      setUnlockLoading(false);
    }
  }

  async function handleExpireConfirm() {
    if (!expireTarget) return;
    setExpireLoading(true);
    try {
      await onExpireUser(expireTarget.userId);
      setExpireTarget(null);
    } finally {
      setExpireLoading(false);
    }
  }

  async function handleReactivateConfirm() {
    if (!reactivateTarget) return;
    setReactivateLoading(true);
    try {
      const expiresAt = reactivatePerpetual ? null : (reactivateDate || null);
      await onReactivateUser(reactivateTarget.userId, expiresAt);
      setReactivateTarget(null);
    } finally {
      setReactivateLoading(false);
    }
  }

  const columns = useMemo(
    () => getUserColumns(
      onDownload,
      handlePickVault,
      handleRefreshOtp,
      setResetTarget,
      setDeleteTarget,
      setLockTarget,
      setUnlockTarget,
      setExpireTarget,
      setReactivateTarget,
      (userId) => { onEmailVault(userId).catch(() => {}); },
      onRowClick,
      actionLoading,
      isProd,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onDownload, handlePickVault, onRowClick, onEmailVault, actionLoading, isProd],
  );


  const hasFilters = selectedStatuses.size > 0 || selectedPlans.size > 0 || usernameFilter !== '' ||
    createdFrom !== '' || createdTo !== '' || lastLoginFrom !== '' || lastLoginTo !== '';

  const filtered = applyFilters(users, selectedStatuses, selectedPlans, usernameFilter, createdFrom, createdTo, lastLoginFrom, lastLoginTo);

  const footerLabel = hasFilters
    ? `Showing ${filtered.length} of ${users.length} ${users.length === 1 ? 'record' : 'records'}`
    : `${users.length} ${users.length === 1 ? 'record' : 'records'}`;

  if (users.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <InboxIcon className="w-10 h-10 mb-3" />
        <p className="font-medium">No users yet</p>
        <p className="text-sm mt-1">Create the first user to get started.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Filter by username..."
            aria-label="Filter by username"
            value={usernameFilter}
            onChange={(e) => setUsernameFilter(e.target.value)}
            className="h-8 w-[150px] lg:w-[250px]"
          />

          <Popover>
            <PopoverTrigger render={
              <Button variant="outline" size="sm" className="h-8 border-dashed" aria-label="Filter by status" />
            }>
              <PlusCircleIcon className="mr-1 h-4 w-4" />
              Status
              {selectedStatuses.size > 0 && (
                <>
                  <Separator orientation="vertical" className="mx-2 h-4" />
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                    {selectedStatuses.size}
                  </Badge>
                  <div className="hidden space-x-1 lg:flex">
                    {selectedStatuses.size > 2 ? (
                      <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                        {selectedStatuses.size} selected
                      </Badge>
                    ) : (
                      Array.from(selectedStatuses).map(status => (
                        <Badge key={status} variant="secondary" className="rounded-sm px-1 font-normal">
                          {statusLabel[status]}
                        </Badge>
                      ))
                    )}
                  </div>
                </>
              )}
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Status..." />
                <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    {ALL_STATUSES.map(status => {
                      const isSelected = selectedStatuses.has(status);
                      return (
                        <CommandItem
                          key={status}
                          onSelect={() => toggleStatus(status)}
                          data-checked={isSelected ? 'true' : undefined}
                        >
                          <span className={`mr-2 inline-block h-2 w-2 rounded-full shrink-0 ${statusDot[status]}`} />
                          {statusLabel[status]}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                  {selectedStatuses.size > 0 && (
                    <>
                      <CommandSeparator />
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => setSelectedStatuses(new Set())}
                          className="justify-center text-center"
                        >
                          Clear filters
                        </CommandItem>
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger render={
              <Button variant="outline" size="sm" className="h-8 border-dashed" aria-label="Filter by plan" />
            }>
              <PlusCircleIcon className="mr-1 h-4 w-4" />
              Plan
              {selectedPlans.size > 0 && (
                <>
                  <Separator orientation="vertical" className="mx-2 h-4" />
                  <div className="hidden space-x-1 lg:flex">
                    {Array.from(selectedPlans).map(plan => (
                      <Badge key={plan} variant="secondary" className="rounded-sm px-1 font-normal">
                        {planLabel[plan]}
                      </Badge>
                    ))}
                  </div>
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                    {selectedPlans.size}
                  </Badge>
                </>
              )}
            </PopoverTrigger>
            <PopoverContent className="w-[160px] p-0" align="start">
              <Command>
                <CommandList>
                  <CommandGroup>
                    {ALL_PLANS.map(plan => (
                      <CommandItem
                        key={plan}
                        onSelect={() => togglePlan(plan)}
                        data-checked={selectedPlans.has(plan) ? 'true' : undefined}
                      >
                        {planLabel[plan]}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {selectedPlans.size > 0 && (
                    <>
                      <CommandSeparator />
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => setSelectedPlans(new Set())}
                          className="justify-center text-center"
                        >
                          Clear filters
                        </CommandItem>
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <DateRangeFilter
            label="Created"
            ariaLabel="Filter by created date"
            from={createdFrom}
            to={createdTo}
            onFrom={setCreatedFrom}
            onTo={setCreatedTo}
          />

          <DateRangeFilter
            label="Last login"
            ariaLabel="Filter by last login date"
            from={lastLoginFrom}
            to={lastLoginTo}
            onFrom={setLastLoginFrom}
            onTo={setLastLoginTo}
          />

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 lg:px-3"
              onClick={() => {
                setSelectedStatuses(new Set());
                setSelectedPlans(new Set());
                setUsernameFilter('');
                setCreatedFrom('');
                setCreatedTo('');
                setLastLoginFrom('');
                setLastLoginTo('');
              }}
            >
              Reset
              <XMarkIcon className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>

        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          loadingLabel="Loading users…"
          emptyMessage={hasFilters ? 'No users match the current filters' : 'No users yet'}
          defaultSorting={[{ id: 'username', desc: false }]}
          onRowClick={onRowClick}
        />

        {/* Footer record count */}
        <div className="text-sm text-muted-foreground">{footerLabel}</div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.username}</strong> and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lock confirmation */}
      <AlertDialog
        open={lockTarget !== null}
        onOpenChange={(open) => { if (!open) setLockTarget(null); }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Lock user?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{lockTarget?.username}</strong> will be locked and will no longer be able to log in. You can unlock them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleLockConfirm}
              disabled={lockLoading}
            >
              {lockLoading ? 'Locking…' : 'Lock user'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unlock confirmation */}
      <AlertDialog
        open={unlockTarget !== null}
        onOpenChange={(open) => { if (!open) setUnlockTarget(null); }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock user?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{unlockTarget?.username}</strong> will be restored to active status and will be able to log in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlockConfirm}
              disabled={unlockLoading}
            >
              {unlockLoading ? 'Unlocking…' : 'Unlock user'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Expire confirmation */}
      <AlertDialog
        open={expireTarget !== null}
        onOpenChange={(open) => { if (!open) setExpireTarget(null); }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Expire user?</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">Expire user confirmation</AlertDialogDescription>
            <div className="space-y-2 text-sm text-muted-foreground -mt-2">
              <p>
                <strong className="text-foreground">{expireTarget?.username}</strong> will be set to expired status. They will be able to log in and read their vault but cannot make changes.
              </p>
              {expireTarget?.expiresAt ? (
                <p>
                  Planned expiration date:{' '}
                  <span className="font-medium text-orange-600">{expireTarget.expiresAt.slice(0, 10)}</span>
                </p>
              ) : (
                <p className="text-muted-foreground/60">This is a lifetime user — no planned expiration date.</p>
              )}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={handleExpireConfirm}
              disabled={expireLoading}
            >
              {expireLoading ? 'Expiring…' : 'Expire user'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset login confirmation */}
      <AlertDialog
        open={resetTarget !== null}
        onOpenChange={(open) => { if (!open) setResetTarget(null); }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset login?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all passkeys, clear the password, and generate a new one-time password for <strong>{resetTarget?.username}</strong>. The user will need to set up their account again. Existing vaults and their encrypted content will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleResetConfirm}
              disabled={resetLoading}
            >
              {resetLoading ? 'Resetting…' : 'Reset login'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Vault picker dialog — shown when user has multiple vaults */}
      <Dialog
        open={vaultPickerUser !== null}
        onOpenChange={(open) => { if (!open) setVaultPickerUser(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select vault to download</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{vaultPickerUser?.username}</strong> has {vaultPickerUser?.vaultCount} vaults. Choose one to download.
            </p>
            <div className="flex flex-col gap-2 mt-3">
              {(vaultPickerUser?.vaults ?? []).map((v: UserVaultStub) => (
                <Button
                  key={v.vaultId}
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    onDownload(vaultPickerUser!.userId, vaultPickerUser!.username, v.vaultId);
                    setVaultPickerUser(null);
                  }}
                >
                  <ArrowDownTrayIcon className="mr-2 h-4 w-4 shrink-0" />
                  {v.displayName}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVaultPickerUser(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate dialog */}
      <Dialog
        open={reactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReactivateTarget(null);
            setReactivateDate(defaultExpiresAt());
            setReactivatePerpetual(false);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reactivate user</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <p className="text-muted-foreground">
              Reactivate <strong className="text-foreground">{reactivateTarget?.username}</strong> and set a new expiration date.
            </p>
            <div className="space-y-2">
              <Label htmlFor="reactivate-expires">Expiration date</Label>
              <Input
                id="reactivate-expires"
                type="date"
                value={reactivateDate}
                onChange={e => setReactivateDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                disabled={reactivatePerpetual}
              />
              <label className="flex items-center gap-2 text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={reactivatePerpetual}
                  onChange={e => setReactivatePerpetual(e.target.checked)}
                  className="rounded"
                />
                ♾ Lifetime — never expires
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReactivateTarget(null)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleReactivateConfirm}
              disabled={reactivateLoading}
            >
              {reactivateLoading ? 'Reactivating…' : 'Reactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
