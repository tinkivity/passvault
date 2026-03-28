import React, { createContext, useContext, useState, useCallback } from 'react';
import type { UserRole, UserStatus, UserPlan } from '@passvault/shared';

export interface AuthState {
  token: string | null;
  role: UserRole | null;
  username: string | null;
  status: UserStatus | null;
  plan: UserPlan | null;
  encryptionSalt: string | null;
  loginEventId: string | null;
}

interface AuthContextValue extends AuthState {
  setAuth: (state: AuthState) => void;
  clearAuth: () => void;
}

const initialState: AuthState = {
  token: null,
  role: null,
  username: null,
  status: null,
  plan: null,
  encryptionSalt: null,
  loginEventId: null,
};

const SESSION_KEY = 'pv_session';

function loadSession(): AuthState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return initialState;
    return { ...initialState, ...JSON.parse(raw) } as AuthState;
  } catch {
    return initialState;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuthState] = useState<AuthState>(loadSession);

  const setAuth = useCallback((state: AuthState) => {
    setAuthState(state);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch { /* quota */ }
  }, []);

  const clearAuth = useCallback(() => {
    setAuthState(initialState);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }, []);

  return (
    <AuthContext.Provider value={{ ...auth, setAuth, clearAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
