import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';

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

const emptyEvents = vi.fn().mockResolvedValue({ events: [] });

function setupMock(stats = { totalUsers: 0, totalVaultSizeBytes: 0, loginsLast7Days: 0 }) {
  mockUseAdmin.mockReturnValue({
    getStats: vi.fn().mockResolvedValue(stats),
    getLoginEvents: emptyEvents,
    loading: false,
    error: null,
  } as unknown as ReturnType<typeof useAdmin>);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ token: 'test-token' } as ReturnType<typeof useAuth>);
    vi.clearAllMocks();
  });

  it('renders all three metric card labels', async () => {
    setupMock();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/^users$/i)).toBeInTheDocument();
      expect(screen.getByText(/vault storage/i)).toBeInTheDocument();
      expect(screen.getByText(/logins \(last 7 days\)/i)).toBeInTheDocument();
    });
  });

  it('calls getStats on mount', async () => {
    const mockGetStats = vi.fn().mockResolvedValue({ totalUsers: 0, totalVaultSizeBytes: 0, loginsLast7Days: 0 });
    mockUseAdmin.mockReturnValue({
      getStats: mockGetStats,
      getLoginEvents: emptyEvents,
      loading: false,
      error: null,
    } as unknown as ReturnType<typeof useAdmin>);
    renderPage();
    await waitFor(() => expect(mockGetStats).toHaveBeenCalledTimes(1));
  });

  it('displays user count after loading', async () => {
    setupMock({ totalUsers: 7, totalVaultSizeBytes: 0, loginsLast7Days: 0 });
    renderPage();
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
  });

  it('user count links to /admin/users', async () => {
    setupMock({ totalUsers: 3, totalVaultSizeBytes: 0, loginsLast7Days: 0 });
    renderPage();
    await waitFor(() => {
      const link = screen.getByRole('link', { name: '3' });
      expect(link).toHaveAttribute('href', '/admin/users');
    });
  });

  it('displays formatted vault storage', async () => {
    setupMock({ totalUsers: 0, totalVaultSizeBytes: 2048, loginsLast7Days: 0 });
    renderPage();
    await waitFor(() => expect(screen.getByText('2.0 KB')).toBeInTheDocument());
  });

  it('displays login count', async () => {
    setupMock({ totalUsers: 0, totalVaultSizeBytes: 0, loginsLast7Days: 15 });
    renderPage();
    await waitFor(() => expect(screen.getByText('15')).toBeInTheDocument());
  });

  it('login count links to /admin/logs/logins', async () => {
    setupMock({ totalUsers: 0, totalVaultSizeBytes: 0, loginsLast7Days: 42 });
    renderPage();
    await waitFor(() => {
      const link = screen.getByRole('link', { name: '42' });
      expect(link).toHaveAttribute('href', '/admin/logs/logins');
    });
  });

  it('displays "0 B" for zero vault storage', async () => {
    setupMock();
    renderPage();
    await waitFor(() => expect(screen.getByText('0 B')).toBeInTheDocument());
  });

  it('shows error message when admin.error is set', async () => {
    mockUseAdmin.mockReturnValue({
      getStats: vi.fn().mockResolvedValue({ totalUsers: 0, totalVaultSizeBytes: 0, loginsLast7Days: 0 }),
      getLoginEvents: emptyEvents,
      loading: false,
      error: 'Failed to load stats',
    } as unknown as ReturnType<typeof useAdmin>);
    renderPage();
    await waitFor(() => expect(screen.getByText('Failed to load stats')).toBeInTheDocument());
  });
});
