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
  loading: false,
  error: null as string | null,
};

const pendingUser: UserSummary = {
  userId: 'u1',
  username: 'bob',
  status: 'pending_first_login',
  createdAt: '2024-01-15T00:00:00Z',
  lastLoginAt: null,
  vaultSizeBytes: 2048,
  email: 'bob@example.com',
};

const activeUser: UserSummary = {
  ...pendingUser,
  userId: 'u2',
  username: 'alice',
  status: 'active',
  lastLoginAt: '2024-03-01T00:00:00Z',
};

function renderDetail(user?: UserSummary) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: `/admin/users/${user?.userId ?? 'u1'}`, state: user ? { user } : undefined }]}
    >
      <Routes>
        <Route path="/admin/users/:userId" element={<UserDetailPage />} />
        <Route path="/admin/users" element={<div>Users List</div>} />
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
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('renders email', () => {
    renderDetail(pendingUser);
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('renders em-dash for missing last login', () => {
    renderDetail(pendingUser);
    // Check that there's a dash shown for last login
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

  it('shows Refresh OTP and Delete User buttons only for pending_first_login', () => {
    renderDetail(pendingUser);
    expect(screen.getByText('Refresh OTP')).toBeInTheDocument();
    expect(screen.getByText('Delete User')).toBeInTheDocument();
  });

  it('does not show Refresh OTP or Delete User for active user', () => {
    renderDetail(activeUser);
    expect(screen.queryByText('Refresh OTP')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete User')).not.toBeInTheDocument();
  });

  it('always shows Download Vault button', () => {
    renderDetail(activeUser);
    expect(screen.getByText('Download Vault')).toBeInTheDocument();
  });

  it('calls downloadUserVault when Download Vault is clicked', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByText('Download Vault'));
    expect(mockAdmin.downloadUserVault).toHaveBeenCalledWith('u1', 'bob');
  });

  it('shows Confirm Delete / Cancel buttons before deleting', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByText('Delete User'));
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(mockAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it('cancels delete when Cancel is clicked', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByText('Delete User'));
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Delete User')).toBeInTheDocument();
    expect(mockAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it('calls deleteUser and navigates to users list after confirm', async () => {
    renderDetail(pendingUser);
    await userEvent.click(screen.getByText('Delete User'));
    await userEvent.click(screen.getByText('Confirm Delete'));
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
});
