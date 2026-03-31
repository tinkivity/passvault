import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AuthProvider } from '../../context/AuthContext';
import { AdminSidebar } from './AdminSidebar';

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({
    username: 'testuser',
    firstName: null,
    displayName: null,
    plan: 'free',
    adminChangePassword: vi.fn(),
    loading: false,
  }),
}));

function renderSidebar(path = '/admin/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <SidebarProvider>
          <AdminSidebar onLogout={() => {}} />
        </SidebarProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AdminSidebar', () => {
  // ---- Navigation links always visible ----------------------------------------

  it('renders Dashboard link', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('Dashboard link points to /admin/dashboard', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/admin/dashboard');
  });

  it('User link is always visible', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /^users?$/i })).toBeInTheDocument();
  });

  it('User link points to /admin/users', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /^users?$/i })).toHaveAttribute('href', '/admin/users');
  });

  it('Logins link is always visible', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /^logins$/i })).toBeInTheDocument();
  });

  it('Logins link points to /admin/logs/logins', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /^logins$/i })).toHaveAttribute('href', '/admin/logs/logins');
  });

  // ---- Group labels -----------------------------------------------------------

  it('shows Management group label', () => {
    renderSidebar();
    expect(screen.getByText('Management')).toBeInTheDocument();
  });

  it('shows Logs group label', () => {
    renderSidebar();
    expect(screen.getByText('Logs')).toBeInTheDocument();
  });

  // ---- Active link (aria-current) ---------------------------------------------

  it('Dashboard link has aria-current="page" when on /admin/dashboard', () => {
    renderSidebar('/admin/dashboard');
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('aria-current', 'page');
  });

  it('User link has aria-current="page" when on /admin/users', () => {
    renderSidebar('/admin/users');
    expect(screen.getByRole('link', { name: /^users?$/i })).toHaveAttribute('aria-current', 'page');
  });

  it('Logins link has aria-current="page" when on /admin/logs/logins', () => {
    renderSidebar('/admin/logs/logins');
    expect(screen.getByRole('link', { name: /^logins$/i })).toHaveAttribute('aria-current', 'page');
  });

  it('Dashboard link does not have aria-current when on /admin/users', () => {
    renderSidebar('/admin/users');
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current', 'page');
  });
});
