import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from './AdminPage';

vi.mock('../../../hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../../hooks/useAuth.js';

const mockUseAuth = vi.mocked(useAuth);

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      adminChangePassword: vi.fn().mockResolvedValue(undefined),
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /^admin$/i })).toBeInTheDocument();
  });

  it('renders the Change Password section heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument();
  });

  it('renders new password and confirm fields', () => {
    renderPage();
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/new password/i), 'Secure!Pass1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Different!1');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it('does not call adminChangePassword for a password that fails policy', async () => {
    const mockChange = vi.fn();
    mockUseAuth.mockReturnValue({
      adminChangePassword: mockChange,
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
    renderPage();
    await userEvent.type(screen.getByLabelText(/new password/i), 'weak');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'weak');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(mockChange).not.toHaveBeenCalled();
  });

  it('calls adminChangePassword with new password on valid submit', async () => {
    const mockChange = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      adminChangePassword: mockChange,
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
    renderPage();
    await userEvent.type(screen.getByLabelText(/new password/i), 'Secure!Pass1A');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Secure!Pass1A');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(mockChange).toHaveBeenCalledWith({ newPassword: 'Secure!Pass1A' }));
  });

  it('shows success message after password change', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/new password/i), 'Secure!Pass1A');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Secure!Pass1A');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() =>
      expect(screen.getByText(/password changed successfully/i)).toBeInTheDocument(),
    );
  });

  it('clears fields after successful password change', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/new password/i), 'Secure!Pass1A');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Secure!Pass1A');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => screen.getByText(/password changed successfully/i));
    expect(screen.getByLabelText(/new password/i)).toHaveValue('');
    expect(screen.getByLabelText(/confirm password/i)).toHaveValue('');
  });

  it('shows error message when adminChangePassword throws', async () => {
    mockUseAuth.mockReturnValue({
      adminChangePassword: vi.fn().mockRejectedValue(new Error('Server error')),
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
    renderPage();
    await userEvent.type(screen.getByLabelText(/new password/i), 'Secure!Pass1A');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Secure!Pass1A');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
  });

  it('disables the submit button while loading', () => {
    mockUseAuth.mockReturnValue({
      adminChangePassword: vi.fn(),
      loading: true,
    } as unknown as ReturnType<typeof useAuth>);
    renderPage();
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });
});
