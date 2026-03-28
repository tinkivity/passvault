import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { UserSummary } from '@passvault/shared';
import { UserList } from './UserList';

const mockUsers: UserSummary[] = [
  {
    userId: 'u1',
    username: 'charlie',
    status: 'active',
    createdAt: '2024-01-15T00:00:00Z',
    lastLoginAt: '2024-03-01T00:00:00Z',
    vaultSizeBytes: 1024,
    email: 'charlie@example.com',
  },
  {
    userId: 'u2',
    username: 'alice',
    status: 'pending_first_login',
    createdAt: '2024-02-01T00:00:00Z',
    lastLoginAt: null,
    vaultSizeBytes: null,
    email: null,
  },
  {
    userId: 'u3',
    username: 'bob',
    status: 'pending_passkey_setup',
    createdAt: '2024-01-20T00:00:00Z',
    lastLoginAt: '2024-02-15T00:00:00Z',
    vaultSizeBytes: 512,
    email: 'bob@example.com',
  },
];

function renderList(overrides?: {
  onRefreshOtp?: ReturnType<typeof vi.fn>;
  onDeleteUser?: ReturnType<typeof vi.fn>;
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
      onRowClick={overrides?.onRowClick}
    />,
  );
}

describe('UserList', () => {
  it('renders a row for each user', () => {
    renderList();
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('alice')).toBeInTheDocument();
    expect(within(tbody).getByText('bob')).toBeInTheDocument();
    expect(within(tbody).getByText('charlie')).toBeInTheDocument();
  });

  it('shows a loading skeleton while loading', () => {
    renderList({ users: [], loading: true });
    expect(screen.getByText(/Loading users/)).toBeInTheDocument(); // caption sr-only
  });

  it('shows an empty-state message when there are no users', () => {
    renderList({ users: [] });
    expect(screen.getByText(/No users yet/)).toBeInTheDocument();
  });

  it('sorts by username ascending by default', () => {
    renderList();
    const rows = screen.getAllByRole('row').slice(1); // skip header
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

  it('calls onDownload with userId and username when the download button is clicked', async () => {
    const onDownload = vi.fn();
    render(
      <UserList
        users={mockUsers}
        loading={false}
        onDownload={onDownload}
        onRefreshOtp={vi.fn()}
        onDeleteUser={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: "Actions for alice" }));
    await userEvent.click(await screen.findByText(/download vault/i));
    expect(onDownload).toHaveBeenCalledWith('u2', 'alice');
  });

  it('shows the email column with user emails', () => {
    renderList();
    expect(screen.getByText('charlie@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    // alice has no email — shown as em-dash
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows Refresh OTP and Delete options only for pending_first_login users', async () => {
    renderList();
    // alice is pending_first_login — should have both options
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice' }));
    expect(await screen.findByText(/refresh otp/i)).toBeInTheDocument();
    expect(screen.getByText(/delete user/i)).toBeInTheDocument();
    // close menu
    await userEvent.keyboard('{Escape}');
    // bob is pending_passkey_setup — no refresh/delete
    await userEvent.click(screen.getByRole('button', { name: 'Actions for bob' }));
    await screen.findByText(/download vault/i);
    expect(screen.queryByText(/refresh otp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/delete user/i)).not.toBeInTheDocument();
  });

  it('calls onRefreshOtp and shows OtpDisplay on success', async () => {
    const onRefreshOtp = vi.fn().mockResolvedValue({
      username: 'alice',
      oneTimePassword: 'NEWOTP99',
    });
    renderList({ onRefreshOtp });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice' }));
    await userEvent.click(await screen.findByText(/refresh otp/i));
    expect(onRefreshOtp).toHaveBeenCalledWith('u2');
    expect(await screen.findByText('NEWOTP99')).toBeInTheDocument();
  });

  it('"Done" on OtpDisplay returns to the user list', async () => {
    const onRefreshOtp = vi.fn().mockResolvedValue({
      username: 'alice',
      oneTimePassword: 'NEWOTP99',
    });
    renderList({ onRefreshOtp });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice' }));
    await userEvent.click(await screen.findByText(/refresh otp/i));
    await screen.findByText('NEWOTP99');
    await userEvent.click(screen.getByText('Done'));
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('alice')).toBeInTheDocument();
  });

  it('shows confirm/cancel buttons before calling onDeleteUser', async () => {
    const onDeleteUser = vi.fn().mockResolvedValue(undefined);
    renderList({ onDeleteUser });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice' }));
    await userEvent.click(await screen.findByText(/delete user/i));
    expect(await screen.findByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
    expect(onDeleteUser).not.toHaveBeenCalled();
  });

  it('calls onDeleteUser when delete is confirmed', async () => {
    const onDeleteUser = vi.fn().mockResolvedValue(undefined);
    renderList({ onDeleteUser });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice' }));
    await userEvent.click(await screen.findByText(/delete user/i));
    await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
    expect(onDeleteUser).toHaveBeenCalledWith('u2');
  });

  it('cancels delete when Cancel is clicked', async () => {
    const onDeleteUser = vi.fn();
    renderList({ onDeleteUser });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice' }));
    await userEvent.click(await screen.findByText(/delete user/i));
    await userEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));
    expect(onDeleteUser).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Actions for alice' })).toBeInTheDocument();
  });

  it('calls onRowClick with the user when a row is clicked', async () => {
    const onRowClick = vi.fn();
    renderList({ onRowClick });
    const tbody = screen.getAllByRole('rowgroup')[1];
    await userEvent.click(within(tbody).getByText('charlie'));
    expect(onRowClick).toHaveBeenCalledWith(mockUsers.find(u => u.username === 'charlie'));
  });

  it('does not call onRowClick when the actions dropdown trigger is clicked', async () => {
    const onRowClick = vi.fn();
    renderList({ onRowClick });
    await userEvent.click(screen.getByRole('button', { name: 'Actions for alice' }));
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

  it('shows filter bar with status and username controls', () => {
    renderList();
    expect(screen.getByLabelText(/filter by status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by username/i)).toBeInTheDocument();
  });

  it('status filter hides non-matching users', async () => {
    renderList();
    await userEvent.click(screen.getByLabelText(/filter by status/i));
    await userEvent.click(await screen.findByRole('option', { name: /^active$/i }));
    await userEvent.keyboard('{Escape}');
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('charlie')).toBeInTheDocument();
    expect(within(tbody).queryByText('alice')).not.toBeInTheDocument();
    expect(within(tbody).queryByText('bob')).not.toBeInTheDocument();
  });

  it('username filter shows only matching users', async () => {
    renderList();
    await userEvent.type(screen.getByLabelText(/filter by username/i), 'ali');
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('alice')).toBeInTheDocument();
    expect(within(tbody).queryByText('bob')).not.toBeInTheDocument();
    expect(within(tbody).queryByText('charlie')).not.toBeInTheDocument();
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
    expect(within(tbody).getByText('alice')).toBeInTheDocument();
    expect(within(tbody).getByText('bob')).toBeInTheDocument();
    expect(within(tbody).getByText('charlie')).toBeInTheDocument();
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
