import { test, expect } from '@playwright/test';
import { participantFixture, participantEvent, captureParticipant } from './participant-fixture';

const report = { eventId: participantEvent.id, eventTitle: participantEvent.title, eventStatus: 'PUBLISHED', total: 9, byStatus: { CONFIRMED: 5, PENDING_PAYMENT: 2, WAITLISTED: 1, CANCELLED: 1, EXPIRED: 0 }, attendanceCount: 3, confirmedAttendanceCount: 3, simulatedRevenueCents: 15000, paymentMode: 'SIMULATED', checkedAt: new Date().toISOString(), complete: true, registrationsByDay: [{ day: '2026-11-01', count: 2 }, { day: '2026-11-02', count: 7 }], activities: participantEvent.activities.map((activity, index) => ({ activityId: activity.id, title: activity.title, capacity: activity.capacity, total: index ? 4 : 5, byStatus: { CONFIRMED: index ? 2 : 3, PENDING_PAYMENT: 1, WAITLISTED: index ? 0 : 1, CANCELLED: index ? 1 : 0, EXPIRED: 0 }, attendanceCount: index ? 1 : 2, confirmedAttendanceCount: index ? 1 : 2, simulatedRevenueCents: index ? 0 : 15000 })) };
test.use({ reducedMotion: 'reduce' });

test('início azul escuro permite escolher o login de usuário ou organização', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Seu evento acadêmicodo início ao fim.');
  expect(await page.locator('.home-page').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(9, 18, 34)');
  await captureParticipant(page, info, 'home-dark');
  await page.getByRole('link', { name: 'Fazer login', exact: false }).first().click();
  await expect(page).toHaveURL(/\/acesso$/);
  await captureParticipant(page, info, 'login-choice-blue');
  await page.getByRole('link', { name: 'Fazer login como usuário', exact: true }).click();
  await expect(page).toHaveURL(/\/participante\/login$/);
  await page.getByRole('link', { name: 'Escolher tipo de acesso', exact: false }).click();
  await page.getByRole('link', { name: 'Fazer login como organização', exact: true }).click();
  await expect(page).toHaveURL(/\/organizacao\/login$/);
  expect(await page.locator('.organization-auth').evaluate(node => getComputedStyle(node).getPropertyValue('--primary').trim())).toBe('#24658e');
  await captureParticipant(page, info, 'organization-login-blue');
});

test('painéis usam os relatórios, navegam entre eventos e exportam com autenticação', async ({ page }, info) => {
  const state = await participantFixture(page);
  await page.route('**/api/reports/events/*', route => route.fulfill({ json: { report } }));
  await page.route('**/api/reports/events/*/export.csv', route => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    return route.fulfill({ contentType: 'text/csv', headers: { 'content-disposition': 'attachment; filename=relatorio.csv' }, body: 'activity,total\nWorkshop,5\n' });
  });
  await page.goto('/organizacao/painel');
  await expect(page.getByRole('heading', { name: 'Painel Geral do Organizador' })).toBeVisible();
  await expect(page.getByText('Atualizando os indicadores dos eventos…')).toHaveCount(0);
  await expect(page.locator('.dashboard-metric').filter({ hasText: 'Inscrições confirmadas' }).getByText('5', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Curva acumulada de 9 inscrições em 2 dias' })).toBeVisible();
  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 1024 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'painel sem transbordamento em ' + width).toBe(true);
  }
  await captureParticipant(page, info, 'organization-overview');
  await page.getByRole('link', { name: 'Ver painel do evento' }).click();
  await expect(page).toHaveURL(new RegExp('/organizacao/eventos/' + participantEvent.id + '/painel$'));
  await expect(page.getByRole('heading', { name: 'Ocupação por atividade' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar relatório CSV' }).click();
  expect((await download).suggestedFilename()).toContain('relatorio');
  await captureParticipant(page, info, 'organization-event-dashboard');
  expect(state.unexpected).toEqual([]);
});

test('falha no relatório não vira zero nem receita fictícia; atualizar recupera os dados', async ({ page }) => {
  await participantFixture(page);
  let failing = true;
  await page.route('**/api/reports/events/*', route => failing ? route.fulfill({ status: 503, json: { detail: 'Indisponível' } }) : route.fulfill({ json: { report } }));
  await page.goto('/organizacao/painel');
  await expect(page.getByRole('alert')).toContainText('Os totais estão indisponíveis');
  await expect(page.locator('.dashboard-metric').filter({ hasText: 'Receita simulada' }).getByText('—', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Curva acumulada/ })).toHaveCount(0);
  failing = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Eventos monitorados' })).toBeVisible();
});

test('organização vazia permite criar evento e cartões continuam sem hover animado', async ({ page }, info) => {
  await participantFixture(page, { events: [] });
  await page.goto('/organizacao/eventos');
  await expect(page.getByRole('heading', { name: 'Nenhum evento ou curso cadastrado ainda' })).toBeVisible();
  const card = page.locator('.manage-first-event');
  const before = await card.evaluate(node => getComputedStyle(node).transform);
  await card.hover();
  expect(await card.evaluate(node => getComputedStyle(node).transform)).toBe(before);
  await captureParticipant(page, info, 'organization-empty');
  await page.locator('.topnav').getByRole('link', { name: 'Painel Geral' }).click();
  await expect(page.getByRole('heading', { name: 'Nenhum evento neste período' })).toBeVisible();
  await expect(page.locator('.dashboard-metric').filter({ hasText: 'Receita simulada' })).toContainText('0,00');
});
