import { test, expect } from '@playwright/test';
import { participantFixture, participantEvent, registrationFor } from './participant-fixture';

test.use({ reducedMotion: 'reduce' });

test('organizador salva informação pública e recebe confirmação de aviso enfileirado', async ({ page }, info) => {
  const state = await participantFixture(page);
  let payload: any, writes = 0;
  await page.route('**/api/organizer/**', route => route.fulfill({ json: { registrations: [], total: 0, certificates: [] } }));
  await page.route('**/api/events/*/public-information', async route => {
    expect(route.request().method()).toBe('PATCH'); expect(route.request().headers().authorization).toMatch(/^Bearer /);
    writes++; payload = route.request().postDataJSON();
    state.events = state.events.map(event => ({ ...event, ...payload }));
    await route.fulfill({ json: { event: state.events[0], notificationsQueued: true } });
  });
  await page.goto('/organizacao/eventos/' + participantEvent.id + '/gestao?aba=configuracoes');
  await page.getByLabel('Local geral do evento', { exact: true }).fill('Novo campus acadêmico');
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Salvar e avisar inscritos' }).click();
  await expect.poll(() => writes).toBe(1);
  expect(Object.keys(payload).sort()).toEqual(['description','location','sessionTime','streamUrl','title']);
  expect(payload.location).toBe('Novo campus acadêmico');
  await expect(page.getByRole('status').filter({ hasText: 'Os avisos aos inscritos foram enfileirados' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('heading', { name: 'Informações públicas e avisos' }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('public-information-mobile.png'), fullPage: true });
});

test('falha ao salvar informação pública mantém o formulário sem alegar envio', async ({ page }) => {
  await participantFixture(page);
  await page.route('**/api/organizer/**', route => route.fulfill({ json: { registrations: [], total: 0, certificates: [] } }));
  await page.route('**/api/events/*/public-information', route => route.fulfill({ status: 503, json: { message: 'Evento indisponível.' } }));
  await page.goto('/organizacao/eventos/' + participantEvent.id + '/gestao?aba=configuracoes');
  await page.getByLabel('Local geral do evento', { exact: true }).fill('Campus proposto');
  await page.getByRole('button', { name: 'Salvar e avisar inscritos' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Evento indisponível' })).toBeVisible();
  await expect(page.getByLabel('Local geral do evento', { exact: true })).toHaveValue('Campus proposto');
  await expect(page.getByRole('status').filter({ hasText: 'avisos aos inscritos' })).toHaveCount(0);
});

test('checkout permite expiração no provedor simulado sem mostrar confirmação de vaga', async ({ page }) => {
  const registration = registrationFor();
  const state = await participantFixture(page, { registrations: [registration] });
  let posts = 0;
  await page.route('**/api/payments/' + registration.id, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts++; expect(route.request().postDataJSON()).toEqual({ outcome: 'EXPIRED' });
    state.payment = { registrationId: registration.id, amountCents: registration.priceCents, status: 'EXPIRED' };
    state.registrations = [{ ...registration, status: 'EXPIRED' }];
    await route.fulfill({ json: { payment: state.payment } });
  });
  await page.goto('/pagamento/' + registration.id);
  await expect(page.getByText(/provedor externo simulado para demonstração acadêmica/)).toBeVisible();
  await page.getByLabel('Resultado da simulação').selectOption('EXPIRED');
  await page.getByRole('button', { name: 'Simular pagamento' }).click();
  await expect(page.getByRole('heading', { name: 'Reserva expirada', exact: true })).toBeVisible();
  await expect(page.getByText('Sua vaga está garantida', { exact: false })).toHaveCount(0);
  expect(posts).toBe(1);
});
