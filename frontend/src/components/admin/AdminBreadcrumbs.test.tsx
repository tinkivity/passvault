import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminBreadcrumbs } from './AdminBreadcrumbs';

function renderAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="*" element={<AdminBreadcrumbs />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminBreadcrumbs', () => {
  it('renders a breadcrumb nav landmark', () => {
    renderAt('/admin/dashboard');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('shows only "Admin" on dashboard route with no links', () => {
    renderAt('/admin/dashboard');
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows only "Admin" on /admin route', () => {
    renderAt('/admin');
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows "Admin (link) > Users" on /admin/users', () => {
    renderAt('/admin/users');
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin/dashboard');
    expect(screen.getByText('Users')).toBeInTheDocument();
    // "Users" should not be a link (last crumb)
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('shows "Admin > Users > username" on user detail route with state', () => {
    renderAt('/admin/users/user-123', { user: { username: 'bob' } });
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByText('bob')).toBeInTheDocument();
    // "bob" should not be a link (last crumb)
    expect(screen.queryByRole('link', { name: 'bob' })).not.toBeInTheDocument();
  });

  it('falls back to userId in URL when no username in state', () => {
    renderAt('/admin/users/user-abc-123');
    expect(screen.getByText('user-abc-123')).toBeInTheDocument();
  });

  it('falls back to userId when state has no user object', () => {
    renderAt('/admin/users/user-xyz', { someOtherData: true });
    expect(screen.getByText('user-xyz')).toBeInTheDocument();
  });

  it('shows separator between crumbs', () => {
    renderAt('/admin/users');
    expect(screen.getByText('›')).toBeInTheDocument();
  });

  it('shows two separators on user detail route', () => {
    renderAt('/admin/users/u1', { user: { username: 'alice' } });
    expect(screen.getAllByText('›')).toHaveLength(2);
  });

});
