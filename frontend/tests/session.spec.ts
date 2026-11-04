import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

for (const area of ['participante', 'organizacao']) {
  test(area + ': one-hour session survives reload and browser reopening; logout clears all tabs', async ({ page, context, browser, request }) => {
    const email = 'qa-session-' + randomUUID() + '@example.test';
    expect((await request.post('/api/auth/register', { data: { name: 'Conta QA Sessão', email, password: 'Teste123' } })).status()).toBe(201);
    await page.goto('/' + area + '/login');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('Teste123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    const destination = area === 'participante' ? '/eventos' : '/organizacoes';
    await expect(page).toHaveURL(new RegExp(destination + '$'));
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('eventhub.session.v1')!));
    const claims = JSON.parse(Buffer.from(stored.token.split('.')[1], 'base64url').toString());
    expect(claims.exp - claims.iat).toBe(3600);
    expect(stored.expiresAt).toBeLessThanOrEqual(claims.exp * 1000);
    expect(stored.expiresAt - Date.now()).toBeGreaterThan(3500000);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(new RegExp(destination + '$'));
    await expect(page.getByRole('button', { name: 'Menu da conta' })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('eventhub.session.v1')!).expiresAt)).toBe(stored.expiresAt);

    // Restore a new browser context from its saved origin storage, without logging in again.
    const reopened = await browser.newContext({ storageState: await context.storageState() });
    try {
      const restored = await reopened.newPage();
      await restored.goto(new URL(destination, page.url()).toString());
      await expect(restored.getByRole('button', { name: 'Menu da conta' })).toBeVisible();
      expect(await restored.evaluate(() => JSON.parse(localStorage.getItem('eventhub.session.v1')!).expiresAt)).toBe(stored.expiresAt);
    } finally { await reopened.close(); }

    const peer = await context.newPage();
    await peer.goto(new URL(destination, page.url()).toString());
    await expect(peer.getByRole('button', { name: 'Menu da conta' })).toBeVisible();
    await page.getByRole('button', { name: 'Menu da conta' }).click();
    await page.locator('.account-popover').getByRole('button', { name: 'Sair', exact: true }).click();
    await page.getByRole('button', { name: 'Sim, sair', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/' + area + '/login$'));
    await expect(peer).toHaveURL(new RegExp('/' + area + '/login$'));
    expect(await peer.evaluate(() => localStorage.getItem('eventhub.session.v1'))).toBeNull();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  });
}

test('one-hour expiry removes the persisted session instead of extending it on reload', async ({ page, request }) => {
  const email = 'qa-expiry-' + randomUUID() + '@example.test';
  expect((await request.post('/api/auth/register', { data: { name: 'Expiração QA', email, password: 'Teste123' } })).status()).toBe(201);
  await page.clock.install();
  await page.goto('/participante/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('Teste123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/eventos$/);
  await page.clock.fastForward('01:00:01');
  await expect(page).toHaveURL(/\/participante\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('eventhub.session.v1'))).toBeNull();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
});
