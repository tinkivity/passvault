import React, { createContext, useContext, useState, useCallback } from 'react';
import type { UserRole, UserStatus } from '@passvault/shared';

export interface AuthState {
  token: string | null;
  role: UserRole | null;
  username: string | null;
  status: UserStatus | null;
  encryptionSalt: string | null;
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
  encryptionSalt: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuthState] = useState<AuthState>(initialState);

  const setAuth = useCallback((state: AuthState) => {
    setAuthState(state);
  }, []);

  const clearAuth = useCallback(() => {
    setAuthState(initialState);
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
