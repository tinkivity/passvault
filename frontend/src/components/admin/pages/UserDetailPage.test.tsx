import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { UserDetailPage } from './UserDetailPage';
import type { UserSummary } from '@passvault/shared';

vi.mock('../../../hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../hooks/useAdmin.js', () => ({
  useAdmin: vi.fn(),
}));

import { useAuth } from '../../../hooks/useAuth.js';
import { useAdmin } from '../../../hooks/useAdmin.js';

const mockUseAuth = vi.mocked(useAuth);
const mockUseAdmin = vi.mocked(useAdmin);

const mockAdmin = {
  downloadUserVault: vi.fn(),
  refreshOtp: vi.fn(),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  lockUser: vi.fn().mockResolvedValue(undefined),
  unlockUser: vi.fn().mockResolvedValue(undefined),
  expireUser: vi.fn().mockResolvedValue(undefined),
  retireUser: vi.fn().mockResolvedValue(undefined),
  reactivateUser: vi.fn().mockResolvedValue(undefined),
  updateUser: vi.fn().mockResolvedValue(undefined),
  loading: false,
  error: null as string | null,
};

const pendingUser: UserSummary = {
  userId: 'u1',
  username: 'bob@example.com',
  status: 'pending_first_login',
  plan: 'free',
  createdAt: '2024-01-15T00:00:00Z',
  lastLoginAt: null,
  vaultSizeBytes: 2048,
  vaultCount: 1,
  vaults: [{ vaultId: 'v1', displayName: 'Personal' }],
  expiresAt: '2026-12-31',
  firstName: 'Bob',
  lastName: 'Smith',
};

const activeUser: UserSummary = {
  ...pendingUser,
  userId: 'u2',
  username: 'alice@example.com',
  status: 'active',
  lastLoginAt: '2024-03-01T00:00:00Z',
  plan: 'pro',
  expiresAt: null,
  firstName: 'Alice',
  lastName: 'Johnson',
  displayName: 'AJ',
};

function renderDetail(user?: UserSummary) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: `/ui/admin/users/${user?.userId ?? 'u1'}`, state: user ? { user } : undefined }]}
    >
      <Routes>
        <Route path="/ui/admin/users/:userId" element={<UserDetailPage />} />
        <Route path="/ui/admin/users" element={<div>Users List</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('UserDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ token: 'test-token' } as ReturnType<typeof useAuth>);
    mockUseAdmin.mockReturnValue({ ...mockAdmin } as unknown as ReturnType<typeof useAdmin>);
  });

  it('shows "User not found" when no state is provided', () => {
    renderDetail();
    expect(screen.getByText(/User not found/)).toBeInTheDocument();
  });

  it('renders username as heading', () => {
    renderDetail(pendingUser);
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('renders em-dash for missing last login', () => {
    renderDetail(pendingUser);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders formatted last login date for active user', () => {
    renderDetail(activeUser);
    expect(screen.getByText('2024-03-01')).toBeInTheDocument();
  });

  it('shows "Awaiting first login" status badge for pending user', () => {
    renderDetail(pendingUser);
    expect(screen.getByText('Awaiting first login')).toBeInTheDocument();
  });

  it('shows "Active" status badge for active user', () => {
    renderDetail(activeUser);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  // ── Profile fields ─────────────────────────────────────────────────────────

  it('shows displayName when provided', () => {
    renderDetail(activeUser);
    expect(screen.getByText('AJ')).toBeInTheDocument();
  });

  it('shows first + last name when no displayName', () => {
    renderDetail(pendingUser);
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('shows plan in metadata table', () => {
    renderDetail(pendingUser);
    expect(screen.getByText('free')).toBeInTheDocument();
  });

  it('shows expiration date when set', () => {
    renderDetail(pendingUser);
    expect(screen.getByText('2026-12-31')).toBeInTheDocument();
  });

  it('shows lifetime indicator for perpetual users', () => {
    renderDetail(activeUser); // activeUser has expiresAt: null
    expect(screen.getByText(/lifetime/i)).toBeInTheDocument();
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  it('shows Refresh OTP and Delete user buttons only for pending_first_login', () => {
    renderDetail(pendingUser);
    expect(screen.getByText('Refresh OTP')).toBeInTheDocument();
    expect(screen.getByText('Delete user')).toBeInTheDocument();
  });

  it('does not show Refresh OTP or Delete user for active user', () => {
    renderDetail(activeUser);
    expect(screen.queryByText('Refresh OTP')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete user')).not.toBeInTheDocument();
  });

  it('shows a Download button for each vault', () => {
    renderDetail(activeUser);
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('calls downloadUserVault with vaultId when Download is clicked', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByText('Download'));
    expect(mockAdmin.downloadUserVault).toHaveBeenCalledWith('u1', 'bob@example.com', 'v1');
  });

  it('shows Confirm delete / Cancel buttons before deleting', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByText('Delete user'));
    expect(screen.getByText('Confirm delete')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(mockAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it('cancels delete when Cancel is clicked', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByText('Delete user'));
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Delete user')).toBeInTheDocument();
    expect(mockAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it('calls deleteUser and navigates to users list after confirm', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByText('Delete user'));
    await userEvent.click(screen.getByText('Confirm delete'));
    expect(mockAdmin.deleteUser).toHaveBeenCalledWith('u1');
    expect(await screen.findByText('Users List')).toBeInTheDocument();
  });

  it('shows OtpDisplay after Refresh OTP succeeds', async () => {
    mockAdmin.refreshOtp.mockResolvedValue({ username: 'bob', oneTimePassword: 'NEWOTP99' });
    renderDetail(pendingUser);
    await userEvent.click(screen.getByText('Refresh OTP'));
    expect(await screen.findByText('NEWOTP99')).toBeInTheDocument();
  });

  it('navigates back to users list when back button is clicked', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByText(/← Users/));
    expect(screen.getByText('Users List')).toBeInTheDocument();
  });

  // ── Edit form ─────────────────────────────────────────────────────────────

  it('shows Edit button and opens edit form when clicked', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
  });

  it('pre-fills edit form with current user values', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Bob');
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Smith');
  });

  it('calls updateUser when save is clicked', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(mockAdmin.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('closes edit form when Cancel is clicked', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
  });
});
