import { useMemo, useState } from 'react';
import type { ColumnDef, SortingFn } from '@tanstack/react-table';
import type { UserSummary, UserStatus } from '@passvault/shared';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  TrashIcon,
  InboxIcon,
  EllipsisHorizontalIcon,
  PlusCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import { OtpDisplay } from './OtpDisplay.js';
import { DateRangeFilter } from './DateRangeFilter.js';
import { DataTable } from './DataTable.js';

const isEmailEnv = import.meta.env.VITE_ENVIRONMENT !== 'dev';

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return 'empty';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UserListProps {
  users: UserSummary[];
  loading: boolean;
  onDownload: (userId: string, username: string) => void;
  onRefreshOtp: (userId: string) => Promise<{ username: string; oneTimePassword: string }>;
  onDeleteUser: (userId: string) => Promise<void>;
  onRowClick?: (user: UserSummary) => void;
}

const ALL_STATUSES: UserStatus[] = ['active', 'pending_first_login', 'pending_passkey_setup'];

const statusLabel: Record<UserStatus, string> = {
  pending_first_login: 'Awaiting first login',
  pending_passkey_setup: 'Awaiting passkey setup',
  active: 'Active',
};

const statusDot: Record<UserStatus, string> = {
  pending_first_login: 'bg-amber-500',
  pending_passkey_setup: 'bg-blue-500',
  active: 'bg-green-600',
};

const statusPill: Record<UserStatus, string> = {
  pending_first_login: 'bg-amber-500/15 text-amber-600',
  pending_passkey_setup: 'bg-blue-500/15 text-blue-500',
  active: 'bg-green-600/15 text-green-600',
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
  username: string,
  createdFrom: string,
  createdTo: string,
  lastLoginFrom: string,
  lastLoginTo: string,
): UserSummary[] {
  return users.filter((u) => {
    if (statuses.size > 0 && !statuses.has(u.status)) return false;
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

function getUserColumns(
  onDownload: UserListProps['onDownload'],
  onRefreshOtp: (userId: string) => Promise<void>,
  onDeleteUser: (user: UserSummary) => void,
  actionLoading: string | null,
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
  ];

  if (isEmailEnv) {
    cols.push({
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.email ?? '—'}</span>
      ),
    });
  }

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
      accessorKey: 'vaultSizeBytes',
      header: 'Vault Size',
      size: 96,
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
        return (
          <div onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.username}`} />
              }>
                <EllipsisHorizontalIcon className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onDownload(user.userId, user.username)}>
                  <ArrowDownTrayIcon className="mr-2 h-4 w-4" />
                  Download vault ({formatBytes(user.vaultSizeBytes)})
                </DropdownMenuItem>
                {user.status === 'pending_first_login' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => onRefreshOtp(user.userId)}
                      disabled={actionLoading === user.userId + ':refresh'}
                    >
                      <ArrowPathIcon className="mr-2 h-4 w-4" />
                      Refresh OTP
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDeleteUser(user)}
                    >
                      <TrashIcon className="mr-2 h-4 w-4" />
                      Delete user
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

export function UserList({ users, loading, onDownload, onRefreshOtp, onDeleteUser, onRowClick }: UserListProps) {
  const [selectedStatuses, setSelectedStatuses] = useState<Set<UserStatus>>(new Set());
  const [usernameFilter, setUsernameFilter] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [lastLoginFrom, setLastLoginFrom] = useState('');
  const [lastLoginTo, setLastLoginTo] = useState('');
  const [refreshedOtp, setRefreshedOtp] = useState<{ username: string; oneTimePassword: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserSummary | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  function toggleStatus(status: UserStatus) {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  async function handleRefreshOtp(userId: string) {
    setActionLoading(userId + ':refresh');
    try {
      const result = await onRefreshOtp(userId);
      setRefreshedOtp(result);
    } finally {
      setActionLoading(null);
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

  const columns = useMemo(
    () => getUserColumns(onDownload, handleRefreshOtp, setDeleteTarget, actionLoading),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onDownload, actionLoading],
  );

  if (refreshedOtp) {
    return (
      <OtpDisplay
        username={refreshedOtp.username}
        oneTimePassword={refreshedOtp.oneTimePassword}
        onDone={() => setRefreshedOtp(null)}
      />
    );
  }

  const hasFilters = selectedStatuses.size > 0 || usernameFilter !== '' ||
    createdFrom !== '' || createdTo !== '' || lastLoginFrom !== '' || lastLoginTo !== '';

  const filtered = applyFilters(users, selectedStatuses, usernameFilter, createdFrom, createdTo, lastLoginFrom, lastLoginTo);

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
    </>
  );
}
