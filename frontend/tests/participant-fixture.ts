import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Activity, EventData, Payment, Registration } from '../src/services/business';
import type { User } from '../src/types/auth';

// These fixtures exercise frontend state transitions without depending on Docker latency.
// Real service integration remains covered by business.spec.ts and tests/integration.
const userId = 'c20d8c74-9b30-49f5-9640-d03958a77a2b';
export const participant: User = {
  id: userId, name: 'Pessoa QA Participante', email: 'participante-visual@example.test', role: 'PARTICIPANT',
  cpf: '52998224725', phone: '85912345678', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
const future = (days: number, hour = 9) => {
  const value = new Date(Date.now() + days * 86400000);
  value.setUTCHours(hour, 0, 0, 0);
  return value.toISOString();
};
export const paidActivity: Activity = {
  id: '48b3c658-ef22-475f-a9d7-c0b458514342', title: 'Workshop de Arquitetura Distribuída',
  startsAt: future(12), endsAt: future(12, 13), location: 'Sala 2 · Campus Itaperi', responsible: 'Dra. Helena QA',
  capacity: 12, priceCents: 5000, kind: 'Workshop', description: 'Prática de APIs e mensageria entre serviços independentes.', waitlistEnabled: true,
};
export const freeActivity: Activity = {
  ...paidActivity, id: '10cb08de-edc4-4b23-90d6-e88d0296178d', title: 'Palestra Aberta de Computação', priceCents: 0, kind: 'Palestra',
};
export const participantEvent: EventData = {
  id: '38956a12-1568-4da3-9f3a-568401f6d42a', organizationId: '1ea0bce7-a788-4b0f-81b5-87522c336852',
  organizationName: 'Instituto Acadêmico QA', title: 'Simpósio de Sistemas Distribuídos',
  description: 'Programação acadêmica com palestras e atividades práticas sobre serviços, consistência e comunicação.',
  category: 'Congresso', hours: 8, modality: 'Presencial', location: 'UECE · Campus Itaperi', streamUrl: '',
  startsAt: future(12, 8), endsAt: future(13, 18), sessionTime: '08:00 às 18:00', featured: true,
  speakers: [{ id: 'speaker-qa', name: 'Dra. Helena QA', institution: 'UECE', degree: 'Doutorado' }],
  activities: [paidActivity, freeActivity], status: 'PUBLISHED',
};
export function registrationFor(activity: Activity = paidActivity, status: Registration['status'] = 'PENDING_PAYMENT', suffix = '1'): Registration {
  return {
    id: 'registration-qa-' + suffix, userId, activityId: activity.id, eventId: participantEvent.id,
    eventTitle: participantEvent.title, activity: { ...activity }, priceCents: activity.priceCents, status,
    expiresAt: status === 'PENDING_PAYMENT' ? new Date(Date.now() + 15 * 60000).toISOString() : null,
    createdAt: new Date().toISOString(),
  };
}
export async function participantFixture(page: Page, options: {
  registrations?: Registration[]; events?: EventData[]; reserveStatus?: Registration['status'];
  reserveTransportFailure?: boolean; paymentTransportFailure?: boolean; autoConfirm?: boolean;
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({ sub: userId, role: 'PARTICIPANT', iss: 'eventhub-identity', aud: 'eventhub-api', iat: now, exp: now + 3600 })).toString('base64url');
  const session = { token: 'eyJhbGciOiJIUzI1NiJ9.' + claims + '.fixture-signature', user: participant, expiresAt: (now + 3600) * 1000 };
  await page.addInitScript(value => {
    if (!localStorage.getItem('eventhub.session.v1')) localStorage.setItem('eventhub.session.v1', JSON.stringify(value));
  }, session);
  const state = {
    registrations: options.registrations || [] as Registration[],
    events: options.events || [participantEvent], payment: null as Payment | null,
    posts: [] as { path: string; body: Record<string, unknown>; key: string | undefined }[],
    unexpected: [] as string[], autoConfirm: options.autoConfirm !== false,
  };
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace(/^\/api/, ''), method = request.method();
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/status') return reply({ status: 'ready' });
    if (path === '/users/me' && method === 'GET') return reply({ user: participant });
    if (path === '/auth/logout' && method === 'POST') return route.fulfill({ status: 204 });
    if (path === '/events' && method === 'GET') return reply({ events: state.events });
    const availabilityMatch = path.match(/^\/events\/([^/]+)\/availability$/);
    if (availabilityMatch && method === 'GET') {
      const event = state.events.find(item => item.id === availabilityMatch[1] && item.status === 'PUBLISHED');
      if (!event) return reply({ detail: 'Evento não encontrado.' }, 404);
      return reply({ eventId: event.id, checkedAt: new Date().toISOString(), activities: event.activities.map(activity => {
        const used = state.registrations.filter(item => item.activityId === activity.id && (item.status === 'CONFIRMED' || item.status === 'WAITLISTED' || (item.status === 'PENDING_PAYMENT' && item.expiresAt && new Date(item.expiresAt).getTime() > Date.now()))).length;
        return { activityId: activity.id, capacity: activity.capacity, availableSeats: Math.max(0, activity.capacity - used) };
      }) });
    }
    if (/^\/events\/[^/]+$/.test(path) && method === 'GET') {
      const event = state.events.find(event => event.id === path.split('/')[2]);
      return event ? reply({ event }) : reply({ detail: 'Evento não encontrado.' }, 404);
    }
    if (path === '/registrations' && method === 'GET') return reply({ registrations: state.registrations });
    if (method === 'POST') state.posts.push({ path, body: request.postDataJSON() || {}, key: request.headers()['idempotency-key'] });
    if (path === '/registrations' && method === 'POST') {
      const body = request.postDataJSON(), event = state.events.find(event => event.id === body.eventId);
      const activity = event?.activities.find(activity => activity.id === body.activityId);
      if (!activity) return reply({ detail: 'Atividade não encontrada.' }, 404);
      const existing = state.registrations.find(item => item.activityId === activity.id && ['PENDING_PAYMENT', 'CONFIRMED', 'WAITLISTED'].includes(item.status));
      if (existing) return reply({ detail: 'Você já está inscrito nesta atividade.' }, 409);
      const status = options.reserveStatus || (activity.priceCents ? 'PENDING_PAYMENT' : 'CONFIRMED');
      const registration = registrationFor(activity, status);
      state.registrations = [registration, ...state.registrations.filter(item => item.id !== registration.id)];
      if (options.reserveTransportFailure) return route.abort('failed');
      return reply({ registration }, 201);
    }
    const registrationMatch = path.match(/^\/registrations\/([^/]+)(\/cancel)?$/);
    if (registrationMatch) {
      const registration = state.registrations.find(item => item.id === registrationMatch[1]);
      if (!registration) return reply({ detail: 'Inscrição não encontrada.' }, 404);
      if (registrationMatch[2] && method === 'POST') { registration.status = 'CANCELLED'; registration.expiresAt = null; }
      return reply({ registration });
    }
    const paymentMatch = path.match(/^\/payments\/([^/]+)$/);
    if (paymentMatch) {
      const registration = state.registrations.find(item => item.id === paymentMatch[1]);
      if (!registration) return reply({ detail: 'Inscrição não encontrada.' }, 404);
      if (method === 'POST') {
        const outcome = request.postDataJSON().outcome;
        state.payment = { registrationId: registration.id, amountCents: registration.priceCents, status: outcome === 'DECLINED' ? 'DECLINED' : 'APPROVED' };
        if (outcome === 'DECLINED') { registration.status = 'CANCELLED'; registration.expiresAt = null; }
        else if (state.autoConfirm) { registration.status = 'CONFIRMED'; registration.expiresAt = null; }
        if (options.paymentTransportFailure) return route.abort('failed');
      }
      return reply({ payment: state.payment });
    }
    state.unexpected.push(method + ' ' + path);
    return reply({ detail: 'API não prevista pelo cenário de teste.' }, 503);
  });
  return state;
}
export async function captureParticipant(page: Page, info: TestInfo, name: string) {
  for (const viewport of [{ width: 1440, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map(image => image.decode()));
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ': sem rolagem horizontal').toBeTruthy();
    await page.screenshot({ path: info.outputPath(name + (viewport.width === 390 ? '-mobile' : '-desktop') + '.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1024 });
}
