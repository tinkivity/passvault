import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LoginsPage, formatTimestamp, formatDuration, getDurationSeconds } from './LoginsPage';
import type { LoginEventSummary } from '@passvault/shared';

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

const makeEvent = (overrides: Partial<LoginEventSummary> & Pick<LoginEventSummary, 'eventId' | 'username' | 'success' | 'timestamp'>): LoginEventSummary => ({
  userId: 'uid-' + overrides.eventId,
  logoutAt: undefined,
  ...overrides,
});

const events: LoginEventSummary[] = [
  makeEvent({ eventId: 'e1', username: 'alice', success: true,  timestamp: '2024-03-10T08:00:00Z', logoutAt: '2024-03-10T08:03:00Z' }), // 3 min
  makeEvent({ eventId: 'e2', username: 'bob',   success: false, timestamp: '2024-03-11T09:00:00Z' }),                                    // no duration
  makeEvent({ eventId: 'e3', username: 'alice', success: true,  timestamp: '2024-03-12T10:00:00Z', logoutAt: '2024-03-12T10:45:00Z' }), // 45 min
  makeEvent({ eventId: 'e4', username: 'charlie', success: true, timestamp: '2024-03-13T11:00:00Z', logoutAt: '2024-03-13T11:00:30Z' }), // 30 sec
];

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginsPage />
    </MemoryRouter>,
  );
}

function setupMock(evs: LoginEventSummary[] = events) {
  mockUseAdmin.mockReturnValue({
    getLoginEvents: vi.fn().mockResolvedValue({ events: evs }),
    loading: false,
    error: null,
  } as unknown as ReturnType<typeof useAdmin>);
}

// ---- Helper unit tests -------------------------------------------------------

describe('formatTimestamp', () => {
  it('formats ISO to YYYY-MM-DD HH:MM:SS', () => {
    expect(formatTimestamp('2024-03-10T08:05:42Z')).toBe('2024-03-10 08:05:42');
  });
});

describe('getDurationSeconds', () => {
  it('returns null when no logoutAt', () => {
    expect(getDurationSeconds(makeEvent({ eventId: 'x', username: 'a', success: true, timestamp: '2024-01-01T00:00:00Z' }))).toBeNull();
  });
  it('returns seconds between login and logout', () => {
    expect(getDurationSeconds(makeEvent({
      eventId: 'x', username: 'a', success: true,
      timestamp: '2024-01-01T00:00:00Z',
      logoutAt: '2024-01-01T00:02:30Z',
    }))).toBe(150);
  });
});

describe('formatDuration', () => {
  it('returns em-dash for null', () => {
    expect(formatDuration(null)).toBe('—');
  });
  it('formats seconds as mm:ss', () => {
    expect(formatDuration(90)).toBe('01:30');
  });
  it('zero-pads minutes and seconds', () => {
    expect(formatDuration(5)).toBe('00:05');
  });
  it('handles exactly 60 minutes', () => {
    expect(formatDuration(3600)).toBe('60:00');
  });
});

// ---- Component tests ---------------------------------------------------------

describe('LoginsPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ token: 'test-token' } as ReturnType<typeof useAuth>);
    vi.clearAllMocks();
  });

  it('shows loading message while loading', () => {
    mockUseAdmin.mockReturnValue({
      getLoginEvents: vi.fn().mockReturnValue(new Promise(() => {})),
      loading: true,
      error: null,
    } as unknown as ReturnType<typeof useAdmin>);
    renderPage();
    expect(screen.getByText(/loading login events/i)).toBeInTheDocument();
  });

  it('shows empty state when no events', async () => {
    setupMock([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/no login events yet/i)).toBeInTheDocument());
  });

  it('renders a row for each event', async () => {
    setupMock();
    renderPage();
    await waitFor(() => {
      const tbody = screen.getAllByRole('rowgroup')[1];
      expect(within(tbody).getAllByText('alice')).toHaveLength(2);
      expect(within(tbody).getByText('bob')).toBeInTheDocument();
      expect(within(tbody).getByText('charlie')).toBeInTheDocument();
    });
  });

  it('shows success and failure icons', async () => {
    setupMock();
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByTitle('Success').length).toBeGreaterThan(0);
      expect(screen.getByTitle('Failed')).toBeInTheDocument();
    });
  });

  it('shows formatted duration in mm:ss', async () => {
    setupMock();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('03:00')).toBeInTheDocument(); // alice 3 min
      expect(screen.getByText('00:30')).toBeInTheDocument(); // charlie 30 sec
    });
  });

  it('shows em-dash for events with no logout', async () => {
    setupMock();
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('—').length).toBeGreaterThan(0); // bob no logoutAt
    });
  });

  it('shows error message when admin.error is set', async () => {
    mockUseAdmin.mockReturnValue({
      getLoginEvents: vi.fn().mockResolvedValue({ events: [] }),
      loading: false,
      error: 'Network error',
    } as unknown as ReturnType<typeof useAdmin>);
    renderPage();
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
  });

  // ---- Sorting ---------------------------------------------------------------

  it('sorts by timestamp descending by default', async () => {
    setupMock();
    renderPage();
    await waitFor(() => {
      const rows = screen.getAllByRole('row').slice(1);
      // e4 (Mar 13) should be first
      expect(rows[0]).toHaveTextContent('charlie');
    });
  });

  it('clicking timestamp header reverses sort direction', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /login time/i }));
    await userEvent.click(screen.getByRole('button', { name: /login time/i }));
    const rows = screen.getAllByRole('row').slice(1);
    // ascending: e1 (Mar 10) first = alice
    expect(rows[0]).toHaveTextContent('alice');
  });

  it('clicking username header sorts alphabetically ascending', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /username/i }));
    await userEvent.click(screen.getByRole('button', { name: /username/i }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('alice');
    expect(rows[2]).toHaveTextContent('bob');
  });

  it('clicking username header twice reverses sort', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /username/i }));
    await userEvent.click(screen.getByRole('button', { name: /username/i }));
    await userEvent.click(screen.getByRole('button', { name: /username/i }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('charlie');
  });

  it('clicking success header sorts failures first (asc)', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /^success$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^success$/i }));
    const rows = screen.getAllByRole('row').slice(1);
    // false < true ascending → bob (failed) first
    expect(rows[0]).toHaveTextContent('bob');
  });

  it('clicking duration header sorts by seconds ascending (nulls last)', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /duration/i }));
    await userEvent.click(screen.getByRole('button', { name: /duration/i }));
    const rows = screen.getAllByRole('row').slice(1);
    // 30s (charlie), 180s (alice e1), 2700s (alice e3), null (bob)
    expect(rows[0]).toHaveTextContent('charlie');
    expect(rows[3]).toHaveTextContent('bob');
  });

  // ---- Filtering -------------------------------------------------------------

  it('shows filter bar after events load', async () => {
    setupMock();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/filter by status/i)).toBeInTheDocument());
  });

  it('status filter "Failed only" hides successful events', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByLabelText(/filter by status/i));
    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'false');
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('bob')).toBeInTheDocument();
    expect(within(tbody).queryByText('charlie')).not.toBeInTheDocument();
  });

  it('status filter "Success only" hides failed events', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByLabelText(/filter by status/i));
    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'true');
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).queryByText('bob')).not.toBeInTheDocument();
    expect(within(tbody).getByText('charlie')).toBeInTheDocument();
  });

  it('username filter shows only selected user', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByLabelText(/filter by username/i));
    await userEvent.selectOptions(screen.getByLabelText(/filter by username/i), 'charlie');
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('charlie')).toBeInTheDocument();
    expect(within(tbody).queryByText('bob')).not.toBeInTheDocument();
    expect(within(tbody).queryByText('alice')).not.toBeInTheDocument();
  });

  it('username dropdown contains all unique usernames', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByLabelText(/filter by username/i));
    const select = screen.getByLabelText(/filter by username/i);
    const options = within(select).getAllByRole('option');
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain('alice');
    expect(labels).toContain('bob');
    expect(labels).toContain('charlie');
  });

  it('duration filter "No duration recorded" shows only events without logoutAt', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByLabelText(/filter by duration/i));
    await userEvent.selectOptions(screen.getByLabelText(/filter by duration/i), 'none');
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('bob')).toBeInTheDocument();
    expect(within(tbody).queryByText('alice')).not.toBeInTheDocument();
  });

  it('duration filter "< 1 min" shows only sub-minute sessions', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByLabelText(/filter by duration/i));
    await userEvent.selectOptions(screen.getByLabelText(/filter by duration/i), 'lt1');
    const tbody = screen.getAllByRole('rowgroup')[1];
    // charlie: 30 sec, others are longer or null
    expect(within(tbody).getByText('charlie')).toBeInTheDocument();
    expect(within(tbody).queryByText('alice')).not.toBeInTheDocument();
    expect(within(tbody).queryByText('bob')).not.toBeInTheDocument();
  });

  it('duration filter "1 – 5 min" shows 3-minute session only', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByLabelText(/filter by duration/i));
    await userEvent.selectOptions(screen.getByLabelText(/filter by duration/i), '1to5');
    // alice e1: 3 min → shown; alice e3: 45 min → hidden
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('alice');
    expect(rows[0]).toHaveTextContent('03:00');
  });

  it('duration filter "15 – 60 min" shows 45-minute session', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByLabelText(/filter by duration/i));
    await userEvent.selectOptions(screen.getByLabelText(/filter by duration/i), '15to60');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('45:00');
  });

  it('shows "no events match filters" when filters produce empty result', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByLabelText(/filter by status/i));
    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'false');
    await userEvent.selectOptions(screen.getByLabelText(/filter by duration/i), 'lt1');
    expect(screen.getByText(/no events match the current filters/i)).toBeInTheDocument();
  });

  it('clear filters button resets all filters', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByLabelText(/filter by status/i));
    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'false');
    // Clear should appear
    const clearBtn = await screen.findByRole('button', { name: /clear filters/i });
    await userEvent.click(clearBtn);
    // All events visible again
    const tbody = screen.getAllByRole('rowgroup')[1];
    expect(within(tbody).getByText('charlie')).toBeInTheDocument();
    expect(within(tbody).getByText('bob')).toBeInTheDocument();
  });

  it('clear filters button is hidden when no filters are active', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByLabelText(/filter by status/i));
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });

  it('shows event count summary when filters are active', async () => {
    setupMock();
    renderPage();
    await waitFor(() => screen.getByLabelText(/filter by status/i));
    await userEvent.selectOptions(screen.getByLabelText(/filter by status/i), 'true');
    expect(screen.getByText(/showing 3 of 4 events/i)).toBeInTheDocument();
  });
});
