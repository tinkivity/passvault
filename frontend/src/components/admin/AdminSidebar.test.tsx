import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';

function renderSidebar(path = '/admin/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminSidebar />
    </MemoryRouter>,
  );
}

describe('AdminSidebar', () => {
  // ---- Top-level Dashboard link --------------------------------------------

  it('renders Dashboard as a top-level nav link', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('Dashboard link points to /admin/dashboard', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin/dashboard');
  });

  // ---- Management section ---------------------------------------------------

  it('shows Management section header button', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: /management/i })).toBeInTheDocument();
  });

  it('Management label is not all-caps', () => {
    renderSidebar();
    const btn = screen.getByRole('button', { name: /management/i });
    expect(btn.textContent).toMatch(/Management/);
    expect(btn.textContent).not.toBe('MANAGEMENT');
  });

  it('User and Admin links are hidden when Management is collapsed', () => {
    renderSidebar();
    expect(screen.queryByRole('link', { name: 'User' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('User and Admin links appear after expanding Management', async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: /management/i }));
    expect(screen.getByRole('link', { name: 'User' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('User link points to /admin/users', async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: /management/i }));
    expect(screen.getByRole('link', { name: 'User' })).toHaveAttribute('href', '/admin/users');
  });

  it('Admin link points to /admin/management/admin', async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: /management/i }));
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin/management/admin');
  });

  it('clicking Management twice collapses it again', async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: /management/i }));
    await userEvent.click(screen.getByRole('button', { name: /management/i }));
    expect(screen.queryByRole('link', { name: 'User' })).not.toBeInTheDocument();
  });

  // ---- Logs section --------------------------------------------------------

  it('shows Logs section header button', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: /^logs/i })).toBeInTheDocument();
  });

  it('Logs label is not all-caps', () => {
    renderSidebar();
    const btn = screen.getByRole('button', { name: /^logs/i });
    expect(btn.textContent).toMatch(/Logs/);
    expect(btn.textContent).not.toBe('LOGS');
  });

  it('Logins link is hidden when Logs is collapsed', () => {
    renderSidebar();
    expect(screen.queryByRole('link', { name: 'Logins' })).not.toBeInTheDocument();
  });

  it('Logins link appears after expanding Logs', async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: /^logs/i }));
    expect(screen.getByRole('link', { name: 'Logins' })).toBeInTheDocument();
  });

  it('Logins link points to /admin/logs/logins', async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: /^logs/i }));
    expect(screen.getByRole('link', { name: 'Logins' })).toHaveAttribute('href', '/admin/logs/logins');
  });

  it('clicking Logs twice collapses it again', async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: /^logs/i }));
    await userEvent.click(screen.getByRole('button', { name: /^logs/i }));
    expect(screen.queryByRole('link', { name: 'Logins' })).not.toBeInTheDocument();
  });

  // ---- Auto-expand on active route ----------------------------------------

  it('auto-expands Management when on /admin/users', () => {
    renderSidebar('/admin/users');
    expect(screen.getByRole('link', { name: 'User' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('auto-expands Management when on /admin/management/admin', () => {
    renderSidebar('/admin/management/admin');
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('auto-expands Logs when on /admin/logs/logins', () => {
    renderSidebar('/admin/logs/logins');
    expect(screen.getByRole('link', { name: 'Logins' })).toBeInTheDocument();
  });

  it('does not auto-expand other sections when on /admin/logs/logins', () => {
    renderSidebar('/admin/logs/logins');
    expect(screen.queryByRole('link', { name: 'User' })).not.toBeInTheDocument();
  });

  // ---- Active styling ------------------------------------------------------

  it('applies active styling to Dashboard when on /admin/dashboard', () => {
    renderSidebar('/admin/dashboard');
    expect(screen.getByRole('link', { name: 'Dashboard' }).className).toMatch(/border-primary/);
  });

  it('applies active styling to User when on /admin/users', () => {
    renderSidebar('/admin/users');
    expect(screen.getByRole('link', { name: 'User' }).className).toMatch(/border-primary/);
  });

  it('applies active styling to Logins when on /admin/logs/logins', () => {
    renderSidebar('/admin/logs/logins');
    expect(screen.getByRole('link', { name: 'Logins' }).className).toMatch(/border-primary/);
  });

  it('applies active styling to Admin when on /admin/management/admin', () => {
    renderSidebar('/admin/management/admin');
    expect(screen.getByRole('link', { name: 'Admin' }).className).toMatch(/border-primary/);
  });

  // ---- Initial visible links -----------------------------------------------

  it('only Dashboard is visible as a link on initial render', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation');
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Dashboard']);
  });
});
