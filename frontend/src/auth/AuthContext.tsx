import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { LoginResult, User } from '../types/auth';

type Session = { token: string; user: User; expiresAt: number };
type AuthState = {
  session: Session | null; notice: string;
  signIn: (data: LoginResult) => void;
  signOut: (notice?: string) => void;
  setUser: (user: User) => void;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState('');
  const signOut = useCallback((message = '') => { setSession(null); setNotice(message); }, []);
  const signIn = useCallback((data: LoginResult) => {
    setNotice('');
    setSession({ token: data.accessToken, user: data.user, expiresAt: Date.now() + data.expiresIn * 1000 });
  }, []);
  const setUser = useCallback((user: User) => {
    setSession(previous => previous && previous.user.id === user.id ? { ...previous, user } : previous);
  }, []);
  const expiresAt = session?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(() => signOut('Sua sessão expirou. Entre novamente.'), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt, signOut]);
  return <AuthContext.Provider value={{ session, notice, signIn, signOut, setUser }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider ausente');
  return context;
}

