import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Browser contract tests: every /api request is intercepted; no real user or service is touched.
const root = fileURLToPath(new URL('..', import.meta.url));
const organizationId = '10000000-0000-4000-8000-000000000001';
const otherInstitutionId = '10000000-0000-4000-8000-000000000002';
const instant = new Date().toISOString();
const participant = { id: '20000000-0000-4000-8000-000000000001', name: 'Participante do servidor', email: 'participante@example.test', role: 'PARTICIPANT', organizationId: null, createdAt: instant, updatedAt: instant };
const organizer = { ...participant, id: '20000000-0000-4000-8000-000000000002', name: 'Organizador do servidor', email: 'organizador@example.test', role: 'ORGANIZER', organizationId };
const institution = { id: organizationId, name: 'Instituição de teste', description: 'Teste isolado', membershipRole: 'OWNER', createdAt: instant, updatedAt: instant };
const activity = { id: '30000000-0000-4000-8000-000000000001', title: 'Oficina de integração', description: 'Atividade para teste do contrato', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), location: 'Sala 1', responsible: 'Docente', capacity: 2, priceCents: 1500, waitlistEnabled: false };
const event = { id: '40000000-0000-4000-8000-000000000001', organizationId, organizationName: institution.name, title: 'Evento de integração', description: 'Evento acadêmico para teste isolado', category: 'Workshop', hours: 1, modality: 'Presencial', location: 'Campus', streamUrl: '', startsAt: activity.startsAt, endsAt: activity.endsAt, sessionTime: '', featured: true, speakers: [], activities: [activity], status: 'PUBLISHED' };
let server, browser, origin;

before(async () => {
  server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
}, { timeout: 60000 });

after(async () => { await browser?.close(); await server?.close(); });

function loginResult(user) {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({ alg: 'RS256' })}.${encode({ sub: user.id, role: user.role, organizationId: user.organizationId, iss: 'eventhub-identity', aud: 'eventhub-api', iat: now, exp: now + 3600 })}.intercepted-test-signature`;
  return { user, accessToken, tokenType: 'Bearer', expiresIn: 3600 };
}

async function fixture(t, user, { cachedUser, rejectIdentity = false, unavailableIdentity = false, free = false, reportData } = {}) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const requests = [], unexpected = [];
  let registration, payment;
  const currentActivity = free ? { ...activity, priceCents: 0 } : activity;
  const currentEvent = { ...event, activities: [currentActivity] };
  const credentials = loginResult(user);
  if (cachedUser) await context.addInitScript(session => localStorage.setItem('eventhub.session.v1', JSON.stringify(session)), { token: credentials.accessToken, user: cachedUser, expiresAt: Date.now() + 3500000 });
  await context.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const body = req.postDataJSON();
    requests.push({ path, query: url.search, method: req.method(), body, headers: req.headers() });
    const reply = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (path === '/auth/login') {
      const expectedRole = body.area === 'organization' ? 'ORGANIZER' : 'PARTICIPANT';
      if (user.role !== expectedRole) return reply({ message: user.role === 'PARTICIPANT'
        ? 'Esta conta é de participante. Acesse a área do participante.'
        : 'Esta conta é de organizador. Acesse a área do organizador.' }, 403);
      return reply(credentials);
    }
    if (path === '/users/me') return unavailableIdentity ? reply({ message: 'Identidade temporariamente indisponível' }, 503) : rejectIdentity ? reply({ message: 'Sessão inválida' }, 401) : reply({ user });
    if (path === '/organizations') return reply({ organizations: [institution] });
    if (path === '/organizations/' + organizationId) return reply({ organization: institution });
    if (path === '/organizations/' + organizationId + '/members') return reply({ members: [{ ...organizer, role: 'OWNER' }, { ...organizer, id: 'segundo-organizador', name: 'Segundo organizador', role: 'ORGANIZER' }] });
    if (path === '/events') return reply({ events: [currentEvent] });
    if (path === '/events/' + event.id) return reply({ event: currentEvent });
    if (path === '/events/' + event.id + '/availability') return reply({ eventId: event.id, checkedAt: instant, activities: [{ activityId: activity.id, capacity: activity.capacity, availableSeats: 2 }] });
    if (reportData && path === '/reports/events/' + event.id) return reply({ report: reportData });
    if (path === '/registrations' && req.method() === 'GET') return reply({ registrations: registration ? [registration] : [] });
    if (path === '/registrations' && req.method() === 'POST') {
      registration = { id: '50000000-0000-4000-8000-000000000001', userId: user.id, eventId: event.id, eventTitle: event.title, activityId: activity.id, activity: currentActivity, priceCents: currentActivity.priceCents, status: free ? 'CONFIRMED' : 'PENDING_PAYMENT', expiresAt: free ? null : new Date(Date.now() + 900000).toISOString(), createdAt: instant, ...(free ? { checkInCredential: 'free-test-credential' } : {}) };
      return reply({ registration }, 201);
    }
    if (registration && path === '/registrations/' + registration.id) return reply({ registration });
    if (registration && path === '/payments/' + registration.id) {
      if (req.method() === 'POST') {
        payment = { registrationId: registration.id, amountCents: activity.priceCents, status: body.outcome };
        registration = { ...registration, status: body.outcome === 'APPROVED' ? 'CONFIRMED' : body.outcome === 'DECLINED' ? 'CANCELLED' : 'EXPIRED', expiresAt: null, checkInCredential: body.outcome === 'APPROVED' ? 'test-credential' : undefined };
      }
      return reply({ payment: payment || null });
    }
    unexpected.push(`${req.method()} ${path}`);
    return reply({ message: 'Endpoint não previsto pelo teste' }, 500);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  // Initial Vite module compilation can be slow while the isolated stack is building.
  page.setDefaultNavigationTimeout(60000);
  t.after(() => assert.deepEqual(unexpected, [], 'All application requests must be intercepted by a known contract'));
  return { page, requests };
}

async function signIn(page, area, user) {
  await page.goto(origin + `/${area}/login`);
  await page.locator('#login-email').fill(user.email);
  await page.locator('#login-password').fill('SenhaDeTeste123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test('participant login from organization entry shows an error without creating a session', async t => {
  const { page, requests } = await fixture(t, participant);
  await signIn(page, 'organizacao', participant);
  await page.getByRole('alert').filter({ hasText: 'Esta conta é de participante. Acesse a área do participante.' }).waitFor();
  assert.equal(page.url(), origin + '/organizacao/login');
  assert.equal(await page.evaluate(() => localStorage.getItem('eventhub.session.v1')), null);
  assert.deepEqual(requests.find(req => req.path === '/auth/login').body, { email: participant.email, password: 'SenhaDeTeste123', area: 'organization' });
  assert.equal(requests.some(req => req.path !== '/auth/login'), false);
  await page.getByRole('link', { name: 'Acesso de participante', exact: true }).click();
  await signIn(page, 'participante', participant);
  await page.waitForURL(origin + '/eventos');
  await page.getByRole('heading', { name: 'Eventos com Inscrições Abertas' }).waitFor();
  await page.goto(origin + '/organizacao/eventos');
  await page.waitForURL(origin + '/eventos');
  assert.equal(requests.some(req => req.path === '/events' && req.query === '?managed=true'), false);
  await page.getByRole('button', { name: 'Menu da conta' }).click();
  assert.equal(await page.getByText('Trocar área de acesso').count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Instituição e equipe' }).count(), 0);
});

test('organizer login from participant entry shows an error without creating a session', async t => {
  const { page, requests } = await fixture(t, organizer);
  await signIn(page, 'participante', organizer);
  await page.getByRole('alert').filter({ hasText: 'Esta conta é de organizador. Acesse a área do organizador.' }).waitFor();
  assert.equal(page.url(), origin + '/participante/login');
  assert.equal(await page.evaluate(() => localStorage.getItem('eventhub.session.v1')), null);
  assert.deepEqual(requests.find(req => req.path === '/auth/login').body, { email: organizer.email, password: 'SenhaDeTeste123', area: 'participant' });
  assert.equal(requests.some(req => req.path !== '/auth/login'), false);
  await page.getByRole('link', { name: 'Acesso de organização', exact: true }).click();
  await signIn(page, 'organizacao', organizer);
  await page.waitForURL(origin + '/organizacao/eventos');
  await page.getByRole('heading', { name: 'Gestão de Cursos e Eventos Acadêmicos' }).waitFor();
  await page.goto(origin + '/minhas-inscricoes');
  await page.waitForURL(origin + '/organizacao/eventos');
  assert.equal(requests.some(req => req.path === '/registrations'), false);
  await page.getByRole('button', { name: 'Menu da conta' }).click();
  assert.equal(await page.getByText('Trocar área de acesso').count(), 0);
});

test('cached personal data is replaced by server identity before protected content mounts', async t => {
  const { page, requests } = await fixture(t, participant, { cachedUser: { ...participant, name: 'Nome adulterado', email: 'adulterado@example.test' } });
  await page.goto(origin + '/perfil');
  await page.getByRole('heading', { name: 'Meu Perfil', exact: true }).waitFor();
  await page.locator('.account-trigger').filter({ hasText: participant.name }).waitFor();
  assert.equal(await page.getByText('Nome adulterado', { exact: true }).count(), 0);
  assert.equal(requests[0].path, '/users/me');
});

test('forged role and institution cache never mounts organizer resources when server denies the session', async t => {
  const { page, requests } = await fixture(t, organizer, { cachedUser: organizer, rejectIdentity: true });
  await page.goto(origin + '/organizacao/eventos');
  await page.waitForURL(origin + '/organizacao/login');
  await page.locator('#login-email').waitFor();
  assert.equal(requests.some(req => req.path === '/events' || req.path.startsWith('/organizations')), false);
});

test('identity outage keeps protected pages closed and offers recovery', async t => {
  const { page, requests } = await fixture(t, organizer, { cachedUser: organizer, unavailableIdentity: true });
  await page.goto(origin + '/organizacao/eventos');
  await page.getByRole('alert').filter({ hasText: 'Identidade temporariamente indisponível' }).waitFor();
  await page.getByRole('button', { name: 'Tentar novamente' }).waitFor();
  assert.equal(requests.some(req => req.path === '/events'), false);
});

test('organizer institution is fixed; foreign IDs are rejected and several team members remain visible', async t => {
  const { page, requests } = await fixture(t, organizer, { cachedUser: organizer });
  await page.goto(origin + '/organizacao/perfil/' + otherInstitutionId);
  await page.getByRole('alert').filter({ hasText: 'Instituição fora do vínculo autorizado' }).waitFor();
  assert.equal(requests.some(req => req.path.includes(otherInstitutionId)), false);
  await page.goto(origin + '/organizacoes');
  await page.getByText('Segundo organizador', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Criar organização', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Adicionar organizador', exact: true }).count(), 0);
  await page.goto(origin + '/organizacao/eventos/novo');
  await page.locator('#event-org').waitFor();
  assert.equal(await page.locator('#event-org').inputValue(), institution.name);
  assert.equal(await page.locator('#event-org').getAttribute('readonly'), '');
  assert.equal(await page.locator('select#event-org').count(), 0);
});

test('authorized organizer preview uses managed API and hides enrollment actions', async t => {
  const { page, requests } = await fixture(t, organizer, { cachedUser: organizer });
  await page.goto(origin + '/organizacao/eventos/' + event.id + '/visualizar');
  await page.getByRole('heading', { name: event.title, exact: true }).waitFor();
  assert.equal(requests.some(req => req.path === '/events/' + event.id && req.query === '?managed=true'), true);
  assert.equal(requests.some(req => req.path === '/registrations'), false);
  assert.equal(await page.getByRole('link', { name: 'Inscrever-se na atividade' }).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Inscreva-se' }).count(), 0);
});

for (const outcome of ['APPROVED', 'DECLINED', 'EXPIRED']) test(`participant checkout follows payment outcome ${outcome} using reservation identity`, async t => {
  const { page, requests } = await fixture(t, participant, { cachedUser: participant });
  await page.goto(origin + '/atividades/' + event.id + '/' + activity.id + '/inscricao');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar e Continuar', exact: true }).click();
  await page.waitForURL(/\/pagamento\//);
  await page.locator('#payment-outcome').selectOption(outcome);
  await page.getByRole('button', { name: 'Simular pagamento', exact: true }).click();
  const result = outcome === 'APPROVED' ? 'Inscrição confirmada com sucesso!' : outcome === 'DECLINED' ? 'Inscrição cancelada' : 'Reserva expirada';
  await page.getByRole('heading', { name: result, exact: true }).waitFor();
  const reservationRequest = requests.find(req => req.path === '/registrations' && req.method === 'POST');
  assert.deepEqual(reservationRequest.body, { eventId: event.id, activityId: activity.id });
  assert.ok(reservationRequest.headers['idempotency-key']);
  assert.equal(requests.filter(req => req.path.startsWith('/payments/') && req.method === 'POST').length, 1);
});

test('free activity proceeds directly to confirmation without requesting payment', async t => {
  const { page, requests } = await fixture(t, participant, { cachedUser: participant, free: true });
  await page.goto(origin + '/atividades/' + event.id + '/' + activity.id + '/inscricao');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar e Continuar', exact: true }).click();
  await page.waitForURL(/\/inscricoes\//);
  await page.getByRole('heading', { name: 'Inscrição confirmada com sucesso!', exact: true }).waitFor();
  assert.equal(requests.some(req => req.path.startsWith('/payments/')), false);
});

function dashboardReport(overrides = {}) {
  const byStatus = { CONFIRMED: 1, PENDING_PAYMENT: 4, WAITLISTED: 2, CANCELLED: 1, EXPIRED: 1 };
  return { eventId: event.id, eventTitle: event.title, eventStatus: 'PUBLISHED', total: 9, byStatus, attendanceCount: 1, confirmedAttendanceCount: 1, simulatedRevenueCents: 1500, paymentMode: 'SIMULATED', checkedAt: instant, complete: true, activities: [{ activityId: activity.id, title: activity.title, capacity: 9, total: 9, byStatus, attendanceCount: 1, confirmedAttendanceCount: 1, simulatedRevenueCents: 1500, occupiedCount: 2, availableCount: 7 }], ...overrides };
}

test('event dashboard displays payment transaction indicators and authoritative occupancy', async t => {
  const reportData = dashboardReport({ payments: { available: true, mode: 'SIMULATED', byStatus: { PENDING: 11, APPROVED: 12, DECLINED: 13, EXPIRED: 14 }, approvedAmountCents: 12345, transactionCount: 50, withoutTransactionCount: 0 } });
  const { page } = await fixture(t, organizer, { cachedUser: organizer, reportData });
  await page.goto(origin + '/organizacao/eventos/' + event.id + '/painel');
  await page.getByRole('heading', { name: 'Pagamentos e receita', exact: true }).waitFor();
  assert.match(await page.locator('.dashboard-money').innerText(), /123,45/);
  assert.deepEqual(await page.locator('.dashboard-payment-status dt').allTextContents(), ['Pendentes', 'Aprovados', 'Recusados', 'Expirados']);
  assert.deepEqual(await page.locator('.dashboard-payment-status dd').allTextContents(), ['11', '12', '13', '14']);
  await page.getByText('2 / 9 vagas', { exact: true }).waitFor();
  assert.match(await page.locator('.dashboard-capacity-row small').innerText(), /7 disponíveis/);
  await page.getByText('SIMULAÇÃO ACADÊMICA', { exact: true }).waitFor();
});

test('unavailable payment source shows an explanation without zero-valued transactions', async t => {
  const { page } = await fixture(t, organizer, { cachedUser: organizer, reportData: dashboardReport({ payments: { available: false, mode: 'SIMULATED', reason: 'PAYMENT_SOURCE_UNAVAILABLE_OR_INCONSISTENT' } }) });
  await page.goto(origin + '/organizacao/eventos/' + event.id + '/painel');
  await page.getByRole('status').filter({ hasText: 'Os dados de pagamentos estão temporariamente indisponíveis.' }).waitFor();
  assert.equal(await page.locator('.dashboard-money').count(), 0);
  assert.equal(await page.locator('.dashboard-payment-status').count(), 0);
});

test('legacy report retains registration revenue and derives activity occupancy', async t => {
  const reportData = dashboardReport();
  delete reportData.activities[0].occupiedCount;
  delete reportData.activities[0].availableCount;
  const { page } = await fixture(t, organizer, { cachedUser: organizer, reportData });
  await page.goto(origin + '/organizacao/eventos/' + event.id + '/painel');
  await page.getByRole('heading', { name: 'Pagamentos e receita', exact: true }).waitFor();
  assert.match(await page.locator('.dashboard-money').innerText(), /15,00/);
  await page.getByText('5 / 9 vagas', { exact: true }).waitFor();
  assert.match(await page.locator('.dashboard-capacity-row small').innerText(), /4 disponíveis/);
});
