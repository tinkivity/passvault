import { renderHook, render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { AuthProvider, useAuthContext } from './AuthContext';

const sampleAuth = {
  token: 'tok-1',
  role: 'user' as const,
  username: 'alice',
  status: 'active' as const,
  encryptionSalt: 'salt-abc',
};

function Consumer() {
  const ctx = useAuthContext();
  return (
    <div>
      <span data-testid="token">{ctx.token ?? 'null'}</span>
      <span data-testid="role">{ctx.role ?? 'null'}</span>
      <span data-testid="username">{ctx.username ?? 'null'}</span>
      <span data-testid="status">{ctx.status ?? 'null'}</span>
      <button onClick={() => ctx.setAuth(sampleAuth)}>set</button>
      <button onClick={() => ctx.clearAuth()}>clear</button>
    </div>
  );
}

describe('AuthProvider', () => {
  it('starts with all-null state', () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(screen.getByTestId('token').textContent).toBe('null');
    expect(screen.getByTestId('role').textContent).toBe('null');
    expect(screen.getByTestId('username').textContent).toBe('null');
    expect(screen.getByTestId('status').textContent).toBe('null');
  });

  it('setAuth() updates all fields', () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    act(() => { screen.getByText('set').click(); });
    expect(screen.getByTestId('token').textContent).toBe('tok-1');
    expect(screen.getByTestId('role').textContent).toBe('user');
    expect(screen.getByTestId('username').textContent).toBe('alice');
    expect(screen.getByTestId('status').textContent).toBe('active');
  });

  it('clearAuth() resets all fields to null', () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    act(() => { screen.getByText('set').click(); });
    act(() => { screen.getByText('clear').click(); });
    expect(screen.getByTestId('token').textContent).toBe('null');
    expect(screen.getByTestId('role').textContent).toBe('null');
  });
});

describe('useAuthContext', () => {
  it('throws when used outside AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      renderHook(() => useAuthContext())
    ).toThrow('useAuthContext must be used within AuthProvider');
    spy.mockRestore();
  });
});
