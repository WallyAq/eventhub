import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LoginResult, User } from '../types/auth';
import { createSession, readSession, saveSession, SESSION_KEY } from './session';
import type { Session } from './session';
import { ApiError, errorMessage, getProfile } from '../services/identity';
type AuthState = {
  session: Session | null; notice: string;
  signIn: (data: LoginResult) => void;
  signOut: (notice?: string) => void;
  setUser: (user: User) => void;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Stored identity is a cache only. Protected pages mount after server validation.
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(() => Boolean(readSession()));
  const [verificationError, setVerificationError] = useState('');
  const [validationVersion, setValidationVersion] = useState(0);
  const revision = useRef(0);
  const [notice, setNotice] = useState('');
  const signOut = useCallback((message = '') => {
    revision.current += 1; saveSession(null); setSession(null); setNotice(message); setChecking(false); setVerificationError('');
  }, []);
  const signIn = useCallback((data: LoginResult) => {
    setNotice('');
    const session = createSession(data);
    revision.current += 1; setChecking(false); setVerificationError('');
    saveSession(session);
    setSession(session);
  }, []);
  const setUser = useCallback((user: User) => {
    setSession(previous => {
      if (!previous || previous.user.id !== user.id || previous.user.role !== user.role || previous.user.organizationId !== user.organizationId) return previous;
      const updated = { ...previous, user };
      saveSession(updated);
      return updated;
    });
  }, []);
  useEffect(() => {
    const cached = readSession();
    if (!cached) { saveSession(null); setChecking(false); return; }
    const controller = new AbortController(), current = ++revision.current;
    setChecking(true); setVerificationError(''); setSession(null);
    getProfile(cached.token, controller.signal).then(user => {
      if (controller.signal.aborted || revision.current !== current) return;
      const verified = createSession({ accessToken: cached.token, user, tokenType: 'Bearer', expiresIn: Math.max(0, (cached.expiresAt - Date.now()) / 1000) });
      if (verified.expiresAt <= Date.now()) { signOut('Sua sessão expirou. Entre novamente.'); return; }
      saveSession(verified); setSession(verified);
    }).catch(error => {
      if (controller.signal.aborted || revision.current !== current) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) signOut('Sua sessão terminou. Entre novamente.');
      else setVerificationError(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted && revision.current === current) setChecking(false); });
    return () => controller.abort();
  }, [validationVersion, signOut]);
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
        revision.current += 1; setSession(null); setNotice(''); setVerificationError(''); setChecking(Boolean(readSession())); setValidationVersion(value => value + 1);
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
  return <AuthContext.Provider value={{ session, notice, signIn, signOut, setUser }}>{checking || verificationError ? <main className="organizations-main"><section className="status-panel" aria-busy={checking}>
    <h1>Verificando sua conta</h1>{checking ? <p role="status">Validando seu perfil e vínculo institucional no servidor…</p> : <><p className="error" role="alert">{verificationError}</p><button type="button" className="primary-button" onClick={() => setValidationVersion(value => value + 1)}>Tentar novamente</button><button type="button" className="secondary-button" onClick={() => signOut()}>Voltar ao acesso</button></>}
  </section></main> : children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider ausente');
  return context;
}

