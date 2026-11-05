import { test, expect } from '@playwright/test';
import { participantFixture, participantEvent, registrationFor } from './participant-fixture';

test.use({ reducedMotion: 'reduce' });

test('gestão do organizador: filtros, presença, falhas e cancelamento confirmado', async ({ page }, info) => {
  await participantFixture(page);
  const event = { ...participantEvent };
  const registration = { ...registrationFor(event.activities[0], 'CONFIRMED'), participant: { name: 'Ana Organizadora QA', email: 'ana@example.test' } };
  const requests: string[] = [];
  let failCheckIn = true;
  await page.route('**/api/attendance/registrations/**', route => route.fulfill({ json: { attendance: null } }));
  await page.route('**/api/organizer/**', async route => {
    const url = new URL(route.request().url()); requests.push(url.pathname + url.search);
    await route.fulfill({ json: { registrations: [registration], total: 1 } });
  });
  await page.route('**/api/attendance/check-ins', async route => {
    expect(route.request().postDataJSON()).toEqual({ registrationId: registration.id });
    await route.fulfill(failCheckIn ? { status: 409, json: { detail: 'A atividade ainda não começou.' } } : { json: { attendance: { registrationId: registration.id } } });
  });
  await page.route('**/api/events/' + event.id + '**', async route => {
    if (route.request().method() === 'POST') event.status = 'CANCELLED';
    await route.fulfill({ json: { event } });
  });
  await page.goto('/organizacao/eventos/' + event.id + '/gestao');
  await expect(page.getByRole('heading', { name: event.title })).toBeVisible();
  await expect(page.getByText(registration.participant.email)).toBeVisible();
  await page.screenshot({ path: info.outputPath('organizer-registrations-desktop.png'), fullPage: true });
  await page.getByLabel('Filtrar por status').selectOption('CONFIRMED');
  await expect.poll(() => requests.some(path => path.includes('status=CONFIRMED'))).toBe(true);
  await page.getByRole('button', { name: 'Atividades e check-in', exact: true }).click();
  await page.getByRole('button', { name: 'Lista de presença', exact: true }).first().click();
  await page.getByRole('button', { name: 'Registrar presença', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Validação de presença' });
  await dialog.getByRole('button', { name: 'Confirmar presença' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('A atividade ainda não começou.');
  failCheckIn = false;
  await dialog.getByRole('button', { name: 'Confirmar presença' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Presença registrada' })).toBeVisible();
  await page.getByRole('button', { name: 'Professores e palestrantes', exact: true }).click();
  await expect(page.getByRole('heading', { name: event.speakers[0].name })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('organizer-speakers-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Configurações do evento', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Certificados e emissão digital' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar evento', exact: true }).click();
  const cancel = page.getByRole('dialog', { name: 'Cancelar evento?' });
  await expect(cancel.getByRole('button', { name: 'Sim, cancelar evento' })).toBeDisabled();
  await cancel.getByLabel(/Para confirmar, digite/).fill(event.title);
  await cancel.getByRole('button', { name: 'Sim, cancelar evento' }).click();
  await expect(cancel).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancelar evento', exact: true })).toBeDisabled();
});

test('inscrições: exportação autenticada e confirmação de cancelamento', async ({ page }) => {
  await participantFixture(page);
  let cancelled = false;
  const registration = { ...registrationFor(participantEvent.activities[0], 'CONFIRMED'), participant: { name: 'Bruno QA', email: 'bruno@example.test' } };
  await page.route('**/api/organizer/**', async route => {
    const request = route.request();
    expect(request.headers().authorization).toMatch(/^Bearer /);
    if (request.url().includes('export.csv')) return route.fulfill({ contentType: 'text/csv', body: 'Nome;Status\nBruno QA;CONFIRMED' });
    if (request.method() === 'POST') { cancelled = true; return route.fulfill({ json: { registration: { ...registration, status: 'CANCELLED' } } }); }
    return route.fulfill({ json: { registrations: [{ ...registration, status: cancelled ? 'CANCELLED' : 'CONFIRMED' }], total: 1 } });
  });
  await page.goto('/organizacao/eventos/' + participantEvent.id + '/gestao');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  expect((await download).suggestedFilename()).toBe('inscricoes-' + participantEvent.id + '.csv');
  await page.getByRole('button', { name: 'Cancelar inscrição', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancelar inscrição?' });
  await dialog.getByRole('button', { name: 'Voltar' }).click();
  expect(cancelled).toBe(false);
  await page.getByRole('button', { name: 'Cancelar inscrição', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(page.getByRole('cell', { name: 'Cancelada', exact: true })).toBeVisible();
  expect(cancelled).toBe(true);
});
