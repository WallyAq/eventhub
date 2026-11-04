import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { LoginResult, User } from '../types/auth';
import { createSession, readSession, saveSession, SESSION_KEY } from './session';
import type { Session } from './session';
type AuthState = {
  session: Session | null; notice: string;
  signIn: (data: LoginResult) => void;
  signOut: (notice?: string) => void;
  setUser: (user: User) => void;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readSession);
  const [notice, setNotice] = useState('');
  const signOut = useCallback((message = '') => { saveSession(null); setSession(null); setNotice(message); }, []);
  const signIn = useCallback((data: LoginResult) => {
    setNotice('');
    const session = createSession(data);
    saveSession(session);
    setSession(session);
  }, []);
  const setUser = useCallback((user: User) => {
    setSession(previous => {
      if (!previous || previous.user.id !== user.id) return previous;
      const updated = { ...previous, user };
      saveSession(updated);
      return updated;
    });
  }, []);
  const expiresAt = session?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(() => signOut('Sua sessão expirou. Entre novamente.'), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt, signOut]);
  useEffect(() => {
    if (!readSession()) saveSession(null);
    const sync = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === SESSION_KEY || event.key === null)) {
        setSession(readSession()); setNotice('');
      }
    };
    const checkExpiry = () => {
      if (expiresAt && expiresAt <= Date.now()) signOut('Sua sessão expirou. Entre novamente.');
    };
    window.addEventListener('storage', sync);
    window.addEventListener('focus', checkExpiry);
    document.addEventListener('visibilitychange', checkExpiry);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', checkExpiry);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, [expiresAt, signOut]);
  return <AuthContext.Provider value={{ session, notice, signIn, signOut, setUser }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider ausente');
  return context;
}

