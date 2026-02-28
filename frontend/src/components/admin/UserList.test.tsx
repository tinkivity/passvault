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
  },
  {
    userId: 'u2',
    username: 'alice',
    status: 'pending_first_login',
    createdAt: '2024-02-01T00:00:00Z',
    lastLoginAt: null,
    vaultSizeBytes: null,
  },
  {
    userId: 'u3',
    username: 'bob',
    status: 'pending_totp_setup',
    createdAt: '2024-01-20T00:00:00Z',
    lastLoginAt: '2024-02-15T00:00:00Z',
    vaultSizeBytes: 512,
  },
];

describe('UserList', () => {
  it('renders a row for each user', () => {
    render(<UserList users={mockUsers} loading={false} onDownload={vi.fn()} />);
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('charlie')).toBeInTheDocument();
  });

  it('shows a loading message while loading', () => {
    render(<UserList users={[]} loading={true} onDownload={vi.fn()} />);
    expect(screen.getByText(/Loading users/)).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no users', () => {
    render(<UserList users={[]} loading={false} onDownload={vi.fn()} />);
    expect(screen.getByText(/No users yet/)).toBeInTheDocument();
  });

  it('sorts by username ascending by default', () => {
    render(<UserList users={mockUsers} loading={false} onDownload={vi.fn()} />);
    const rows = screen.getAllByRole('row').slice(1); // skip header
    expect(rows[0]).toHaveTextContent('alice');
    expect(rows[1]).toHaveTextContent('bob');
    expect(rows[2]).toHaveTextContent('charlie');
  });

  it('clicking the username header a second time reverses the sort', async () => {
    render(<UserList users={mockUsers} loading={false} onDownload={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /username/i }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('charlie');
    expect(rows[2]).toHaveTextContent('alice');
  });

  it('clicking a different column sorts by that column', async () => {
    render(<UserList users={mockUsers} loading={false} onDownload={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /created/i }));
    const rows = screen.getAllByRole('row').slice(1);
    // createdAt ascending: charlie (Jan 15), bob (Jan 20), alice (Feb 01)
    expect(rows[0]).toHaveTextContent('charlie');
    expect(rows[1]).toHaveTextContent('bob');
    expect(rows[2]).toHaveTextContent('alice');
  });

  it('sorts lastLoginAt ascending with null values last', async () => {
    render(<UserList users={mockUsers} loading={false} onDownload={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /last login/i }));
    const rows = screen.getAllByRole('row').slice(1);
    // bob: Feb 15, charlie: Mar 01, alice: null (last)
    expect(rows[0]).toHaveTextContent('bob');
    expect(rows[1]).toHaveTextContent('charlie');
    expect(rows[2]).toHaveTextContent('alice');
  });

  it('shows status badges for all status values', () => {
    render(<UserList users={mockUsers} loading={false} onDownload={vi.fn()} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Awaiting first login')).toBeInTheDocument();
    expect(screen.getByText('Awaiting TOTP setup')).toBeInTheDocument();
  });

  it('calls onDownload with userId and username when the download button is clicked', async () => {
    const onDownload = vi.fn();
    render(<UserList users={mockUsers} loading={false} onDownload={onDownload} />);
    await userEvent.click(screen.getByLabelText("Download alice's vault"));
    expect(onDownload).toHaveBeenCalledWith('u2', 'alice');
  });
});
