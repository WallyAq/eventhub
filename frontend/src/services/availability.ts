import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { identityRequest } from './identity';

export type ActivityAvailability = { activityId: string; capacity: number; availableSeats: number };
type EventAvailability = { eventId: string; checkedAt: string; activities: ActivityAvailability[] };
type Snapshot = { key: string; data: EventAvailability | null; loading: boolean; failed: boolean };
const REFRESH_MS = 30000;

function availabilityResponse(value: unknown, eventId: string): EventAvailability {
  const result = value as EventAvailability | null;
  if (!result || result.eventId !== eventId || !Array.isArray(result.activities) || !result.activities.every(item =>
    item && typeof item.activityId === 'string' && Number.isInteger(item.capacity) && item.capacity > 0 &&
    Number.isInteger(item.availableSeats) && item.availableSeats >= 0 && item.availableSeats <= item.capacity
  )) throw new Error('Disponibilidade inválida.');
  return result;
}

export function useEventAvailability(eventId?: string, enabled = true) {
  const { session } = useAuth(), token = session?.token;
  const key = `${token || ''}:${eventId || ''}`;
  const [version, setVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>({ key: '', data: null, loading: false, failed: false });
  useEffect(() => {
    if (!eventId || !enabled) return;
    let active = true, pending = false, timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setSnapshot({ key, data: null, loading: true, failed: false });
    async function refresh() {
      if (!active || pending) return;
      if (timer) clearTimeout(timer);
      if (document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const result = await identityRequest('/events/' + eventId + '/availability', 'GET', undefined, token, controller.signal);
        const data = availabilityResponse(result, eventId!);
        if (active) setSnapshot({ key, data, loading: false, failed: false });
      } catch {
        // A failed refresh must not present an older count as current availability.
        if (active) setSnapshot({ key, data: null, loading: false, failed: true });
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
      active = false; controller.abort(); if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume); window.removeEventListener('focus', resume);
    };
  }, [eventId, enabled, token, key, version]);
  const current = enabled && eventId && snapshot.key === key ? snapshot : null;
  return {
    activities: new Map<string, ActivityAvailability>(current?.data?.activities.map(item => [item.activityId, item]) || []),
    loading: Boolean(enabled && eventId && (!current || current.loading)),
    failed: current?.failed || false,
    reload: () => setVersion(value => value + 1),
  };
}
