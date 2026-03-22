import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('charlie')).toBeInTheDocument();
  });

  it('shows a loading message while loading', () => {
    renderList({ users: [], loading: true });
    expect(screen.getByText(/Loading users/)).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: /created/i }));
    const rows = screen.getAllByRole('row').slice(1);
    // createdAt ascending: charlie (Jan 15), bob (Jan 20), alice (Feb 01)
    expect(rows[0]).toHaveTextContent('charlie');
    expect(rows[1]).toHaveTextContent('bob');
    expect(rows[2]).toHaveTextContent('alice');
  });

  it('sorts lastLoginAt ascending with null values last', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: /last login/i }));
    const rows = screen.getAllByRole('row').slice(1);
    // bob: Feb 15, charlie: Mar 01, alice: null (last)
    expect(rows[0]).toHaveTextContent('bob');
    expect(rows[1]).toHaveTextContent('charlie');
    expect(rows[2]).toHaveTextContent('alice');
  });

  it('shows status badges for all status values', () => {
    renderList();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Awaiting first login')).toBeInTheDocument();
    expect(screen.getByText('Awaiting passkey setup')).toBeInTheDocument();
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
    await userEvent.click(screen.getByLabelText("Download alice's vault"));
    expect(onDownload).toHaveBeenCalledWith('u2', 'alice');
  });

  it('shows the email column with user emails', () => {
    renderList();
    expect(screen.getByText('charlie@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    // alice has no email — shown as em-dash
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows Refresh OTP and Delete buttons only for pending_first_login users', () => {
    renderList();
    expect(screen.getByLabelText('Refresh OTP for alice')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete alice')).toBeInTheDocument();
    expect(screen.queryByLabelText('Refresh OTP for charlie')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Refresh OTP for bob')).not.toBeInTheDocument();
  });

  it('calls onRefreshOtp and shows OtpDisplay on success', async () => {
    const onRefreshOtp = vi.fn().mockResolvedValue({
      username: 'alice',
      oneTimePassword: 'NEWOTP99',
    });
    renderList({ onRefreshOtp });
    await userEvent.click(screen.getByLabelText('Refresh OTP for alice'));
    expect(onRefreshOtp).toHaveBeenCalledWith('u2');
    expect(await screen.findByText('NEWOTP99')).toBeInTheDocument();
  });

  it('"Done" on OtpDisplay returns to the user list', async () => {
    const onRefreshOtp = vi.fn().mockResolvedValue({
      username: 'alice',
      oneTimePassword: 'NEWOTP99',
    });
    renderList({ onRefreshOtp });
    await userEvent.click(screen.getByLabelText('Refresh OTP for alice'));
    await screen.findByText('NEWOTP99');
    await userEvent.click(screen.getByText('Done'));
    expect(screen.getByText('alice')).toBeInTheDocument();
  });

  it('shows confirm/cancel buttons before calling onDeleteUser', async () => {
    const onDeleteUser = vi.fn().mockResolvedValue(undefined);
    renderList({ onDeleteUser });
    await userEvent.click(screen.getByLabelText('Delete alice'));
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(onDeleteUser).not.toHaveBeenCalled();
  });

  it('calls onDeleteUser when delete is confirmed', async () => {
    const onDeleteUser = vi.fn().mockResolvedValue(undefined);
    renderList({ onDeleteUser });
    await userEvent.click(screen.getByLabelText('Delete alice'));
    await userEvent.click(screen.getByText('Confirm'));
    expect(onDeleteUser).toHaveBeenCalledWith('u2');
  });

  it('cancels delete when Cancel is clicked', async () => {
    const onDeleteUser = vi.fn();
    renderList({ onDeleteUser });
    await userEvent.click(screen.getByLabelText('Delete alice'));
    await userEvent.click(screen.getByText('Cancel'));
    expect(onDeleteUser).not.toHaveBeenCalled();
    // Delete button should be visible again
    expect(screen.getByLabelText('Delete alice')).toBeInTheDocument();
  });

  it('calls onRowClick with the user when a row is clicked', async () => {
    const onRowClick = vi.fn();
    renderList({ onRowClick });
    await userEvent.click(screen.getByText('charlie'));
    expect(onRowClick).toHaveBeenCalledWith(mockUsers.find(u => u.username === 'charlie'));
  });

  it('does not call onRowClick when an action button is clicked', async () => {
    const onRowClick = vi.fn();
    renderList({ onRowClick });
    await userEvent.click(screen.getByLabelText("Download alice's vault"));
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
});
