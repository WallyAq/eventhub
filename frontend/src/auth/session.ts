import type { LoginResult, User } from '../types/auth';

export type Session = { token: string; user: User; expiresAt: number };
export const SESSION_KEY = 'eventhub.session.v1';

// This only validates the local cache. API services verify the JWT signature.
function tokenDeadline(token: string, user: User): number {
  const segments = token.split('.');
  if (segments.length !== 3) throw new Error('Sessão inválida.');
  const encoded = segments[1].replace(/-/g, '+').replace(/_/g, '/');
  const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
  if (claims.sub !== user.id || claims.role !== user.role || (claims.organizationId ?? null) !== user.organizationId || claims.iss !== 'eventhub-identity'
      || claims.aud !== 'eventhub-api' || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat)
      || claims.exp <= claims.iat || claims.exp - claims.iat > 3600)
    throw new Error('Sessão inválida.');
  return claims.exp * 1000;
}

export function createSession(data: LoginResult): Session {
  return { token: data.accessToken, user: data.user,
    expiresAt: Math.min(tokenDeadline(data.accessToken, data.user), Date.now() + data.expiresIn * 1000, Date.now() + 3600000) };
}

export function readSession(): Session | null {
  try {
    const session: Session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    const user = session?.user;
    if (user && user.organizationId === undefined && user.role === 'PARTICIPANT') user.organizationId = null;
    if (!session || typeof session.token !== 'string' || !user || !['PARTICIPANT', 'ORGANIZER'].includes(user.role)
        || (user.role === 'PARTICIPANT' ? user.organizationId !== null : typeof user.organizationId !== 'string' || !user.organizationId)
        || ['id', 'name', 'email', 'createdAt', 'updatedAt'].some(key => typeof user[key as keyof User] !== 'string')
        || !Number.isFinite(session.expiresAt)) return null;
    const expiresAt = Math.min(session.expiresAt, tokenDeadline(session.token, user));
    return expiresAt > Date.now() ? { ...session, expiresAt } : null;
  } catch { return null; }
}

export function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* If storage is blocked, keep the current tab's session in memory. */ }
}
