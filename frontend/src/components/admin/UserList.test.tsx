import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { UserSummary } from '@passvault/shared';
import { UserList } from './UserList';

const mockUsers: UserSummary[] = [
  {
    userId: 'u1',
    username: 'charlie@example.com',
    status: 'active',
    plan: 'free',
    createdAt: '2024-01-15T00:00:00Z',
    lastLoginAt: '2024-03-01T00:00:00Z',
    vaultSizeBytes: 1024,
    vaultCount: 1,
    vaults: [{ vaultId: 'v1', displayName: 'Personal' }],
    expiresAt: '2026-12-31',
  },
  {
    userId: 'u2',
    username: 'alice@example.com',
    status: 'pending_first_login',
    plan: 'free',
    createdAt: '2024-02-01T00:00:00Z',
    lastLoginAt: null,
    vaultSizeBytes: null,
    vaultCount: 1,
    vaults: [{ vaultId: 'v2', displayName: 'Personal' }],
    expiresAt: null,
  },
  {
    userId: 'u3',
    username: 'bob@example.com',
    status: 'pending_passkey_setup',
    plan: 'pro',
    createdAt: '2024-01-20T00:00:00Z',
    lastLoginAt: '2024-02-15T00:00:00Z',
    vaultSizeBytes: 512,
    vaultCount: 1,
    vaults: [{ vaultId: 'v3', displayName: 'Personal' }],
    expiresAt: '2025-06-30',
  },
];

function renderList(overrides?: {
  onRefreshOtp?: ReturnType<typeof vi.fn>;
  onDeleteUser?: ReturnType<typeof vi.fn>;
  onLockUser?: ReturnType<typeof vi.fn>;
  onUnlockUser?: ReturnType<typeof vi.fn>;
  onExpireUser?: ReturnType<typeof vi.fn>;
  onReactivateUser?: ReturnType<typeof vi.fn>;
  onRowClick?: ReturnType<typeof vi.fn>;
  users?: UserSummary[];
  loading?: boolean;
}) {
  return render(
    <UserList
      users={overrides?.users ?? mockUsers}
      loading={overrides?.loading ?? false}
      onDownload={vi.fn()}
      onRefreshOtp={overrides?.onRefreshOtp ?? vi.fn()}
      onDeleteUser={overrides?.onDeleteUser ?? vi.fn()}
      onLockUser={overrides?.onLockUser ?? vi.fn()}
      onUnlockUser={overrides?.onUnlockUser ?? vi.fn()}
      onExpireUser={overrides?.onExpireUser ?? vi.fn()}
      onReactivateUser={overrides?.onReactivateUser ?? vi.fn()}
      onEmailVault={vi.fn()}
      onRowClick={overrides?.onRowClick}
    />,
  );
}

describe('UserList', () => {
  it('renders a row for each user', () => {
    renderList();
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('alice@example.com')).toBeInTheDocument();
    expect(within(tbody).getByText('bob@example.com')).toBeInTheDocument();
    expect(within(tbody).getByText('charlie@example.com')).toBeInTheDocument();
  });

  it('shows a loading skeleton while loading', () => {
    renderList({ users: [], loading: true });
    expect(screen.getByText(/Loading users/)).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no users', () => {
    renderList({ users: [] });
    expect(screen.getByText(/No users yet/)).toBeInTheDocument();
  });

  it('sorts by username ascending by default', () => {
    renderList();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('alice');
    expect(rows[1]).toHaveTextContent('bob');
    expect(rows[2]).toHaveTextContent('charlie');
  });

  it('clicking the username header a second time reverses the sort', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: /username/i }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('charlie');
    expect(rows[2]).toHaveTextContent('alice');
  });

  it('clicking a different column sorts by that column', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: 'Created' }));
    const rows = screen.getAllByRole('row').slice(1);
    // createdAt ascending: charlie (Jan 15), bob (Jan 20), alice (Feb 01)
    expect(rows[0]).toHaveTextContent('charlie');
    expect(rows[1]).toHaveTextContent('bob');
    expect(rows[2]).toHaveTextContent('alice');
  });

  it('sorts lastLoginAt ascending with null values last', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: 'Last login' }));
    const rows = screen.getAllByRole('row').slice(1);
    // bob: Feb 15, charlie: Mar 01, alice: null (last)
    expect(rows[0]).toHaveTextContent('bob');
    expect(rows[1]).toHaveTextContent('charlie');
    expect(rows[2]).toHaveTextContent('alice');
  });

  it('shows status badges for all status values', () => {
    renderList();
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('Active')).toBeInTheDocument();
    expect(within(tbody).getByText('Awaiting first login')).toBeInTheDocument();
    expect(within(tbody).getByText('Awaiting passkey setup')).toBeInTheDocument();
  });

  // ── Plan column ───────────────────────────────────────────────────────────────

  it('renders a Plan column header', () => {
    renderList();
    expect(screen.getByRole('button', { name: /^plan$/i })).toBeInTheDocument();
  });

  it('shows Free badge for free-plan users', () => {
    renderList();
    const tbody = screen.getAllByRole('rowgroup')[1];
    // charlie and alice are free
    expect(within(tbody).getAllByText('Free').length).toBeGreaterThanOrEqual(2);
  });

  it('shows Pro badge for pro-plan users', () => {
    renderList();
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('Pro')).toBeInTheDocument();
  });

  it('shows the plan filter button', () => {
    renderList();
    expect(screen.getByLabelText(/filter by plan/i)).toBeInTheDocument();
  });

  it('plan filter hides non-matching users', async () => {
    renderList();
    await userEvent.click(screen.getByLabelText(/filter by plan/i));
    await userEvent.click(await screen.findByRole('option', { name: /^pro$/i }));
    await userEvent.keyboard('{Escape}');
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('bob@example.com')).toBeInTheDocument();
    expect(within(tbody).queryByText('alice@example.com')).not.toBeInTheDocument();
    expect(within(tbody).queryByText('charlie@example.com')).not.toBeInTheDocument();
  });

  it('reset button clears plan filter', async () => {
    renderList();
    await userEvent.click(screen.getByLabelText(/filter by plan/i));
    await userEvent.click(await screen.findByRole('option', { name: /^pro$/i }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: /reset/i }));
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('alice@example.com')).toBeInTheDocument();
    expect(within(tbody).getByText('bob@example.com')).toBeInTheDocument();
    expect(within(tbody).getByText('charlie@example.com')).toBeInTheDocument();
  });

  // ── Expires column ────────────────────────────────────────────────────────────

  it('shows expiration date for users with expiresAt set', () => {
    renderList();
    expect(screen.getByText('2026-12-31')).toBeInTheDocument();
  });

  it('shows lifetime indicator for users with null expiresAt', () => {
    renderList();
    expect(screen.getByText(/lifetime/i)).toBeInTheDocument();
  });

  // ── Row actions ───────────────────────────────────────────────────────────────

  it('calls onDownload with userId and username when the download button is clicked', async () => {
    const onDownload = vi.fn();
    render(
      <UserList
        users={mockUsers}
        loading={false}
        onDownload={onDownload}
        onRefreshOtp={vi.fn()}
        onDeleteUser={vi.fn()}
        onLockUser={vi.fn()}
        onUnlockUser={vi.fn()}
        onExpireUser={vi.fn()}
        onReactivateUser={vi.fn()}
        onEmailVault={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: "Actions for alice@example.com" }));
    await userEvent.click(await screen.findByText(/download vault/i));
    expect(onDownload).toHaveBeenCalledWith('u2', 'alice@example.com', 'v2');
  });

  it('shows the email column with user emails', () => {
    renderList();
    expect(screen.getByText('charlie@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows Refresh OTP and Delete options only for pending_first_login users', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice@example.com' }));
    expect(await screen.findByText(/refresh otp/i)).toBeInTheDocument();
    expect(screen.getByText(/delete user/i)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Actions for bob@example.com' }));
    await screen.findByText(/download vault/i);
    expect(screen.queryByText(/refresh otp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/delete user/i)).not.toBeInTheDocument();
  });

  it('shows Lock option only for active users', async () => {
    renderList();
    // charlie is active — should have lock option
    await userEvent.click(screen.getByRole('button', { name: 'Actions for charlie@example.com' }));
    expect(await screen.findByText(/^lock$/i)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    // alice is pending_first_login — no lock option
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice@example.com' }));
    await screen.findByText(/download vault/i);
    expect(screen.queryByText(/^lock$/i)).not.toBeInTheDocument();
  });

  it('shows Unlock option only for locked users', async () => {
    const lockedUser: UserSummary = { ...mockUsers[0], status: 'locked' };
    renderList({ users: [lockedUser] });
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${lockedUser.username}` }));
    expect(await screen.findByText(/^unlock$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^lock$/i)).not.toBeInTheDocument();
  });

  it('shows Expire option for active and locked users', async () => {
    const lockedUser: UserSummary = { ...mockUsers[0], status: 'locked' };
    renderList({ users: [lockedUser] });
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${lockedUser.username}` }));
    expect(await screen.findByText(/^expire$/i)).toBeInTheDocument();
  });

  it('shows Reactivate option only for expired users', async () => {
    const expiredUser: UserSummary = { ...mockUsers[0], status: 'expired' };
    renderList({ users: [expiredUser] });
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${expiredUser.username}` }));
    expect(await screen.findByText(/^reactivate$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^lock$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^expire$/i)).not.toBeInTheDocument();
  });

  it('shows lock confirmation dialog and calls onLockUser when confirmed', async () => {
    const onLockUser = vi.fn().mockResolvedValue(undefined);
    renderList({ onLockUser });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for charlie@example.com' }));
    await userEvent.click(await screen.findByText(/^lock$/i));
    expect(await screen.findByText(/lock user\?/i)).toBeInTheDocument();
    expect(onLockUser).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /lock user/i }));
    expect(onLockUser).toHaveBeenCalledWith('u1');
  });

  it('cancels lock when Cancel is clicked', async () => {
    const onLockUser = vi.fn();
    renderList({ onLockUser });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for charlie@example.com' }));
    await userEvent.click(await screen.findByText(/^lock$/i));
    await userEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));
    expect(onLockUser).not.toHaveBeenCalled();
  });

  it('shows expire confirmation dialog and calls onExpireUser when confirmed', async () => {
    const onExpireUser = vi.fn().mockResolvedValue(undefined);
    renderList({ onExpireUser });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for charlie@example.com' }));
    await userEvent.click(await screen.findByText(/^expire$/i));
    expect(await screen.findByText(/expire user\?/i)).toBeInTheDocument();
    expect(onExpireUser).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /expire user/i }));
    expect(onExpireUser).toHaveBeenCalledWith('u1');
  });

  it('shows reactivate dialog and calls onReactivateUser when confirmed', async () => {
    const onReactivateUser = vi.fn().mockResolvedValue(undefined);
    const expiredUser: UserSummary = { ...mockUsers[0], status: 'expired' };
    renderList({ users: [expiredUser], onReactivateUser });
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${expiredUser.username}` }));
    await userEvent.click(await screen.findByText(/^reactivate$/i));
    expect(await screen.findByText(/reactivate user/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^reactivate$/i }));
    expect(onReactivateUser).toHaveBeenCalledWith('u1', expect.anything());
  });

  it('calls onRefreshOtp and shows OtpDisplay on success', async () => {
    const onRefreshOtp = vi.fn().mockResolvedValue({
      username: 'alice',
      oneTimePassword: 'NEWOTP99',
    });
    renderList({ onRefreshOtp });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice@example.com' }));
    await userEvent.click(await screen.findByText(/refresh otp/i));
    expect(onRefreshOtp).toHaveBeenCalledWith('u2');
    expect(await screen.findByText('NEWOTP99')).toBeInTheDocument();
  });

  it('"Done" on OtpDisplay returns to the user list', async () => {
    const onRefreshOtp = vi.fn().mockResolvedValue({
      username: 'alice@example.com',
      oneTimePassword: 'NEWOTP99',
    });
    renderList({ onRefreshOtp });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice@example.com' }));
    await userEvent.click(await screen.findByText(/refresh otp/i));
    await screen.findByText('NEWOTP99');
    await userEvent.click(screen.getByText('Done'));
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('alice@example.com')).toBeInTheDocument();
  });

  it('shows confirm/cancel buttons before calling onDeleteUser', async () => {
    const onDeleteUser = vi.fn().mockResolvedValue(undefined);
    renderList({ onDeleteUser });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice@example.com' }));
    await userEvent.click(await screen.findByText(/delete user/i));
    expect(await screen.findByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
    expect(onDeleteUser).not.toHaveBeenCalled();
  });

  it('calls onDeleteUser when delete is confirmed', async () => {
    const onDeleteUser = vi.fn().mockResolvedValue(undefined);
    renderList({ onDeleteUser });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice@example.com' }));
    await userEvent.click(await screen.findByText(/delete user/i));
    await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
    expect(onDeleteUser).toHaveBeenCalledWith('u2');
  });

  it('cancels delete when Cancel is clicked', async () => {
    const onDeleteUser = vi.fn();
    renderList({ onDeleteUser });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice@example.com' }));
    await userEvent.click(await screen.findByText(/delete user/i));
    await userEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));
    expect(onDeleteUser).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Actions for alice@example.com' })).toBeInTheDocument();
  });

  it('calls onRowClick with the user when a row is clicked', async () => {
    const onRowClick = vi.fn();
    renderList({ onRowClick });
    const tbody = screen.getAllByRole('rowgroup')[1];
    await userEvent.click(within(tbody).getByText('charlie@example.com'));
    expect(onRowClick).toHaveBeenCalledWith(mockUsers.find(u => u.username === 'charlie@example.com'));
  });

  it('does not call onRowClick when the actions dropdown trigger is clicked', async () => {
    const onRowClick = vi.fn();
    renderList({ onRowClick });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice@example.com' }));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('adds cursor-pointer class to rows when onRowClick is provided', () => {
    const onRowClick = vi.fn();
    renderList({ onRowClick });
    const rows = screen.getAllByRole('row').slice(1);
    for (const row of rows) {
      expect(row).toHaveClass('cursor-pointer');
    }
  });

  it('does not add cursor-pointer class when onRowClick is omitted', () => {
    renderList(); // no onRowClick
    const rows = screen.getAllByRole('row').slice(1);
    for (const row of rows) {
      expect(row).not.toHaveClass('cursor-pointer');
    }
  });

  it('shows filter bar with status, plan, and username controls', () => {
    renderList();
    expect(screen.getByLabelText(/filter by status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by plan/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by username/i)).toBeInTheDocument();
  });

  it('status filter hides non-matching users', async () => {
    renderList();
    await userEvent.click(screen.getByLabelText(/filter by status/i));
    await userEvent.click(await screen.findByRole('option', { name: /^active$/i }));
    await userEvent.keyboard('{Escape}');
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('charlie@example.com')).toBeInTheDocument();
    expect(within(tbody).queryByText('alice@example.com')).not.toBeInTheDocument();
    expect(within(tbody).queryByText('bob@example.com')).not.toBeInTheDocument();
  });

  it('username filter shows only matching users', async () => {
    renderList();
    await userEvent.type(screen.getByLabelText(/filter by username/i), 'ali');
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('alice@example.com')).toBeInTheDocument();
    expect(within(tbody).queryByText('bob@example.com')).not.toBeInTheDocument();
    expect(within(tbody).queryByText('charlie@example.com')).not.toBeInTheDocument();
  });

  it('shows filtered-empty state when no users match filters', async () => {
    renderList();
    await userEvent.type(screen.getByLabelText(/filter by username/i), 'zzz');
    expect(screen.getByText(/no users match the current filters/i)).toBeInTheDocument();
  });

  it('shows reset button when filters are active', async () => {
    renderList();
    await userEvent.type(screen.getByLabelText(/filter by username/i), 'ali');
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('reset button clears all filters', async () => {
    renderList();
    await userEvent.type(screen.getByLabelText(/filter by username/i), 'ali');
    await userEvent.click(screen.getByRole('button', { name: /reset/i }));
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('alice@example.com')).toBeInTheDocument();
    expect(within(tbody).getByText('bob@example.com')).toBeInTheDocument();
    expect(within(tbody).getByText('charlie@example.com')).toBeInTheDocument();
  });

  it('shows record count footer', () => {
    renderList();
    expect(screen.getByText(/3 records/i)).toBeInTheDocument();
  });

  it('shows filtered record count when filters are active', async () => {
    renderList();
    await userEvent.type(screen.getByLabelText(/filter by username/i), 'ali');
    expect(screen.getByText(/showing 1 of 3 records/i)).toBeInTheDocument();
  });
});
