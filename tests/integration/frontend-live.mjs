import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';

const origin = 'http://127.0.0.1:18080';
const suffix = Date.now().toString(36);
const fixtures = JSON.parse(await readFile(new URL('../../tmp/rules-qa/browser-fixtures.json', import.meta.url), 'utf8'));
const password = fixtures.password;
const directory = new URL('../../output/visual-audit/2026-11-10/live/', import.meta.url);
await mkdir(directory, { recursive: true });
const checks = [], errors = [], screenshots = [], network = [], loginAttempts = [];
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfinished', request => {
    if (request.url().includes('/api/')) network.push({ event: 'finished', method: request.method(), path: new URL(request.url()).pathname, timing: request.timing() });
  });
  page.on('requestfailed', request => {
    if (request.url().includes('/api/')) network.push({ event: 'failed', method: request.method(), path: new URL(request.url()).pathname, failure: request.failure()?.errorText, timing: request.timing() });
  });
}
async function signInUI(page, email, destination) {
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  for (let attempt = 0; attempt < 3; attempt++) {
    const received = page.waitForResponse(response => response.url() === origin + '/api/auth/login', { timeout: 12000 }).catch(() => null);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    const response = await received;
    const result = await Promise.race([page.waitForURL(origin + destination).then(() => 'success'), page.getByRole('alert').first().waitFor().then(() => 'error')]);
    const message = result === 'error' ? await page.getByRole('alert').first().innerText() : '';
    const timing = await page.evaluate(url => performance.getEntriesByName(url).map(entry => ({ duration: entry.duration, fetchStart: entry.fetchStart, requestStart: entry.requestStart, responseStart: entry.responseStart, responseEnd: entry.responseEnd, transferSize: entry.transferSize })), origin + '/api/auth/login');
    loginAttempts.push({ destination, attempt: attempt + 1, status: response?.status() ?? null, result, message, timing });
    console.log(JSON.stringify({ phase: 'UI login', destination, attempt: attempt + 1, status: response?.status() ?? null, result, message }));
    if (result === 'success') return;
    const transient = (!response || response.status() >= 500) && /timed out|conexão|indisponível|conectar/i.test(message);
    assert.ok(transient && attempt < 2, `UI sign-in failed: ${message}`);
  }
}
async function rejectWrongArea(page, email, wrongPath, message, correctLink, correctPath) {
  await page.goto(origin + wrongPath);
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  const received = page.waitForResponse(response => response.url() === origin + '/api/auth/login');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const response = await received;
  assert.equal(response.status(), 403);
  assert.equal((await response.json()).accessToken, undefined);
  await page.getByRole('alert').filter({ hasText: message }).waitFor();
  assert.equal(page.url(), origin + wrongPath);
  assert.equal(await page.evaluate(() => localStorage.getItem('eventhub.session.v1')), null);
  await page.getByRole('link', { name: correctLink, exact: true }).click();
  await page.waitForURL(origin + correctPath);
  checks.push(message);
}
async function api(path, account, method = 'GET', body) {
  const response = await fetch(origin + '/api' + path, { method, headers: { ...(account ? { authorization: 'Bearer ' + account.accessToken } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function screenshot(page, name) {
  await page.screenshot({ path: fileURLToPath(new URL(name + '.png', directory)), fullPage: true });
  const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).map(image => image.getAttribute('src')) }));
  assert.ok(metrics.scrollWidth <= metrics.width, `${name} overflows horizontally`);
  assert.deepEqual(metrics.brokenImages, [], `${name} has broken images`);
  screenshots.push({ name, ...metrics });
}
const organizer = { ...await api('/auth/login', null, 'POST', { email: fixtures.organizer.email, password }), email: fixtures.organizer.email };
const { organization } = await api('/organizations/' + organizer.user.organizationId, organizer);
const start = new Date(Date.now() + 86400000).toISOString(), end = new Date(Date.now() + 90000000).toISOString();
let event;
const { events } = await api('/events?managed=true', organizer);
for (const candidate of events.filter(item => item.title.startsWith('Evento UI ') && item.status === 'PUBLISHED' && new Date(item.startsAt).getTime() > Date.now()).sort((a, b) => b.startsAt.localeCompare(a.startsAt))) {
  const { registrations } = await api('/organizer/events/' + candidate.id + '/registrations', organizer);
  if (!registrations.length) { event = candidate; break; }
}
if (!event) {
  ({ event } = await api('/events', organizer, 'POST', { organizationId: organizer.user.organizationId, title: `Evento UI ${suffix}`, description: 'Evento criado somente para validar os fluxos completos no navegador.', category: 'Workshop', hours: 1, modality: 'Presencial', location: 'Campus de validação', streamUrl: '', startsAt: start, endsAt: end, sessionTime: '10h', featured: true, speakers: [], activities: [ { title: 'Atividade gratuita UI', startsAt: start, endsAt: end, location: 'Sala UI', responsible: 'Docente UI', capacity: 10, priceCents: 0, waitlistEnabled: false }, { title: 'Atividade paga UI', startsAt: start, endsAt: end, location: 'Sala UI', responsible: 'Docente UI', capacity: 10, priceCents: 1000, waitlistEnabled: false } ] }));
  await api(`/events/${event.id}/publish`, organizer, 'POST', {});
}
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
let activePage;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(60000);
  observe(page);
  await page.goto(origin + '/');
  await screenshot(page, 'home-desktop');
  const participantEmail = fixtures.participant.email;
  await rejectWrongArea(page, participantEmail, '/organizacao/login', 'Esta conta é de participante. Acesse a área do participante.', 'Acesso de participante', '/participante/login');
  await signInUI(page, participantEmail, '/eventos');
  await page.getByRole('heading', { name: 'Eventos com Inscrições Abertas', exact: true }).waitFor();
  await page.getByText(event.title, { exact: true }).first().waitFor();
  await screenshot(page, 'participant-catalog-desktop');
  checks.push('Participant login and live catalog');
  await page.goto(origin + '/eventos/' + event.id);
  await page.getByRole('heading', { name: event.title, exact: true }).waitFor();
  await screenshot(page, 'participant-detail-desktop');
  for (const activity of event.activities) {
    await page.goto(origin + `/atividades/${event.id}/${activity.id}/inscricao`);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await screenshot(page, activity.priceCents ? 'paid-checkout-personal-desktop' : 'free-checkout-personal-desktop');
    await page.getByRole('button', { name: 'Confirmar e Continuar', exact: true }).click();
    if (activity.priceCents) {
      await page.waitForURL(/\/pagamento\//);
      await page.locator('#payment-outcome').waitFor();
      await screenshot(page, 'payment-desktop');
      await page.getByRole('button', { name: 'Simular pagamento', exact: true }).click();
    } else await page.waitForURL(/\/inscricoes\//);
    await page.getByRole('heading', { name: 'Inscrição confirmada com sucesso!', exact: true }).waitFor();
    await screenshot(page, activity.priceCents ? 'paid-confirmation-desktop' : 'free-confirmation-desktop');
    checks.push(activity.priceCents ? 'Live paid reservation, payment approval and confirmation' : 'Live free reservation and direct confirmation');
  }
  await page.goto(origin + '/minhas-inscricoes');
  await page.getByRole('heading', { name: 'Minhas Inscrições', exact: true }).waitFor();
  await page.getByText(event.title, { exact: true }).first().waitFor();
  await screenshot(page, 'registrations-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, 'registrations-mobile');
  await page.goto(origin + '/eventos');
  await page.getByRole('heading', { name: 'Eventos com Inscrições Abertas', exact: true }).waitFor();
  await page.getByText(event.title, { exact: true }).first().waitFor();
  await screenshot(page, 'participant-catalog-mobile');
  await page.goto(origin + '/organizacao/eventos');
  await page.waitForURL(origin + '/eventos');
  checks.push('Participant blocked from organizer route');
  await context.close();
  const organizationContext = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const organizationPage = await organizationContext.newPage();
  activePage = organizationPage;
  organizationPage.setDefaultTimeout(60000);
  observe(organizationPage);
  await rejectWrongArea(organizationPage, organizer.email, '/participante/login', 'Esta conta é de organizador. Acesse a área do organizador.', 'Acesso de organização', '/organizacao/login');
  await signInUI(organizationPage, organizer.email, '/organizacao/eventos');
  await organizationPage.getByRole('heading', { name: 'Gestão de Cursos e Eventos Acadêmicos', exact: true }).waitFor();
  await organizationPage.getByText(event.title, { exact: true }).first().waitFor();
  await screenshot(organizationPage, 'organizer-events-desktop');
  await organizationPage.goto(origin + '/organizacao/eventos/novo');
  await organizationPage.locator('#event-org').waitFor();
  assert.equal(await organizationPage.locator('#event-org').inputValue(), organization.name);
  assert.equal(await organizationPage.locator('#event-org').getAttribute('readonly'), '');
  await screenshot(organizationPage, 'organizer-event-editor-desktop');
  checks.push('Organizer login in the correct area retains organizer profile and fixed institution');
  await organizationPage.goto(origin + '/organizacao/eventos/' + event.id + '/visualizar');
  await organizationPage.getByRole('heading', { name: event.title, exact: true }).waitFor();
  assert.equal(await organizationPage.getByRole('link', { name: 'Inscrever-se na atividade' }).count(), 0);
  await screenshot(organizationPage, 'organizer-preview-desktop');
  await organizationPage.goto(origin + '/organizacao/eventos/' + event.id + '/painel');
  await organizationPage.getByRole('heading', { name: 'Pagamentos e receita', exact: true }).waitFor();
  await organizationPage.locator('.dashboard-payment-status').waitFor();
  assert.match(await organizationPage.locator('.dashboard-money').innerText(), /10,00/);
  assert.deepEqual(await organizationPage.locator('.dashboard-payment-status dd').allTextContents(), ['0', '1', '0', '0']);
  await screenshot(organizationPage, 'organizer-dashboard-desktop');
  checks.push('Live reporting shows approved simulated transaction and activity occupancy');
  await organizationPage.goto(origin + '/minhas-inscricoes');
  await organizationPage.waitForURL(origin + '/organizacao/eventos');
  checks.push('Organizer preview and exclusion from participant registrations');
  await organizationPage.getByText(event.title, { exact: true }).first().waitFor();
  await organizationPage.setViewportSize({ width: 390, height: 844 });
  await screenshot(organizationPage, 'organizer-events-mobile');
  await organizationContext.close();
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  await writeFile(new URL('verification.json', directory), JSON.stringify({ origin, checks, screenshots, errors, network, loginAttempts, eventId: event.id }, null, 2));
  console.log(JSON.stringify({ success: true, checks, screenshots: screenshots.map(item => item.name), errors }, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: fileURLToPath(new URL('failure.png', directory)), fullPage: true });
    const failure = { url: activePage.url(), body: await activePage.locator('body').innerText(), browserErrors: errors, network, loginAttempts };
    await writeFile(new URL('failure.json', directory), JSON.stringify(failure, null, 2));
    console.error(JSON.stringify(failure, null, 2));
  }
  throw error;
} finally { await browser.close(); }
