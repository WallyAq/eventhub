import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { Registration } from './business';
import { identityRequest } from './identity';

type Snapshot = { key: string; registrations: Registration[] | null; loading: boolean; failed: boolean };
const REFRESH_MS = 15000;

export function activeRegistration(registration: Registration, now = Date.now()): boolean {
  if (registration.status === 'CONFIRMED' || registration.status === 'WAITLISTED') return true;
  return registration.status === 'PENDING_PAYMENT' && registration.expiresAt !== null &&
    new Date(registration.expiresAt).getTime() > now;
}

export function registrationNotice(registration: Registration): string {
  if (registration.status === 'CONFIRMED') return 'Você já está inscrito nesta atividade.';
  if (registration.status === 'WAITLISTED') return 'Você já está na lista de espera desta atividade.';
  return 'Você já possui uma reserva aguardando pagamento.';
}

export function registrationAction(registration: Registration): string {
  if (registration.status === 'CONFIRMED') return 'Ver comprovante';
  if (registration.status === 'WAITLISTED') return 'Ver lista de espera';
  return 'Continuar pagamento';
}

function registrationsResponse(value: unknown): Registration[] {
  const result = value as { registrations?: Registration[] } | null;
  if (!result || !Array.isArray(result.registrations) || !result.registrations.every(item =>
    item && typeof item.id === 'string' && typeof item.userId === 'string' &&
    typeof item.eventId === 'string' && typeof item.activityId === 'string' &&
    typeof item.createdAt === 'string' && typeof item.eventTitle === 'string' &&
    Number.isInteger(item.priceCents) && item.priceCents >= 0 &&
    item.activity && item.activity.id === item.activityId &&
    ['CONFIRMED', 'PENDING_PAYMENT', 'WAITLISTED', 'CANCELLED', 'EXPIRED'].includes(item.status) &&
    (item.expiresAt === null || typeof item.expiresAt === 'string')
  )) throw new Error('Resposta de inscrições inválida.');
  return result.registrations;
}

export function useEventRegistrations(eventId?: string, enabled = true) {
  const { session } = useAuth(), token = session?.token, userId = session?.user.id;
  const key = `${token || ''}:${userId || ''}:${eventId || ''}`;
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [snapshot, setSnapshot] = useState<Snapshot>({ key: '', registrations: null, loading: false, failed: false });
  const canQuery = Boolean(enabled && eventId && token && userId);

  useEffect(() => {
    if (!canQuery) return;
    let active = true, pending = false, timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setSnapshot({ key, registrations: null, loading: true, failed: false });
    async function refresh() {
      if (!active || pending) return;
      if (timer) clearTimeout(timer);
      if (document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const result = await identityRequest('/registrations', 'GET', undefined, token, controller.signal);
        const registrations = registrationsResponse(result).filter(item => item.userId === userId && item.eventId === eventId);
        if (active) {
          setNow(Date.now());
          setSnapshot({ key, registrations, loading: false, failed: false });
        }
      } catch {
        if (active) setSnapshot({ key, registrations: null, loading: false, failed: true });
      } finally {
        pending = false;
        if (active) timer = setTimeout(refresh, REFRESH_MS);
      }
    }
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    void refresh();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [canQuery, eventId, token, userId, key, version]);

  const current = canQuery && snapshot.key === key ? snapshot : null;
  useEffect(() => {
    const deadlines = current?.registrations?.filter(item => item.status === 'PENDING_PAYMENT')
      .map(item => new Date(item.expiresAt || '').getTime()).filter(deadline => deadline > Date.now()) || [];
    if (!deadlines.length) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(...deadlines) - Date.now() + 1);
    return () => clearTimeout(timer);
  }, [current?.registrations, now]);

  const activities = new Map<string, Registration>();
  for (const registration of current?.registrations || []) {
    if (!activeRegistration(registration, Math.max(now, Date.now()))) continue;
    const previous = activities.get(registration.activityId);
    if (!previous || new Date(registration.createdAt).getTime() > new Date(previous.createdAt).getTime())
      activities.set(registration.activityId, registration);
  }
  return {
    activities,
    loading: Boolean(canQuery && (!current || current.loading)),
    failed: current?.failed || false,
    reload: () => setVersion(value => value + 1),
  };
}
