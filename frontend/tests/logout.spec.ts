import { test, expect } from '@playwright/test';
import { participantFixture } from './participant-fixture';

async function openLogout(page: import('@playwright/test').Page) {
  await page.goto('/eventos');
  await page.getByRole('button', { name: 'Menu da conta', exact: true }).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  return page.getByRole('dialog', { name: 'Deseja realmente sair?', exact: true });
}

test('manual logout revokes the server session before clearing local access', async ({ page }) => {
  await participantFixture(page);
  let release!: () => void, calls = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/logout', async route => { calls++; await gate; await route.fulfill({ status: 204 }); });
  try {
    const dialog = await openLogout(page);
    await dialog.getByRole('button', { name: 'Sim, sair', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Saindo…', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => localStorage.getItem('eventhub.session.v1'))).not.toBeNull();
    expect(calls).toBe(1);
    release();
    await expect(page).toHaveURL(/\/participante\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('eventhub.session.v1'))).toBeNull();
  } finally { release(); }
});

test('logout still clears this browser and explains an unavailable revocation service', async ({ page }) => {
  await participantFixture(page);
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'identity_unavailable' }) }));
  const dialog = await openLogout(page);
  await dialog.getByRole('button', { name: 'Sim, sair', exact: true }).click();
  await expect(page).toHaveURL(/\/participante\/login$/);
  await expect(page.getByText('Você saiu deste navegador. Não foi possível confirmar a revogação da sessão no servidor.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('eventhub.session.v1'))).toBeNull();
});

test('an old logout response cannot clear a newer session restored from another tab', async ({ page }) => {
  await participantFixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/logout', async route => { await gate; await route.fulfill({ status: 204 }); });
  try {
    const dialog = await openLogout(page);
    await dialog.getByRole('button', { name: 'Sim, sair', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Saindo…', exact: true })).toBeDisabled();
    const newToken = await page.evaluate(() => {
      const key = 'eventhub.session.v1', session = JSON.parse(localStorage.getItem(key)!);
      session.token = session.token.replace('fixture-signature', 'new-fixture-signature');
      localStorage.setItem(key, JSON.stringify(session));
      dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }));
      return session.token as string;
    });
    const response = page.waitForResponse('**/api/auth/logout');
    release(); await response;
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(/\/eventos$/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('eventhub.session.v1')!).token)).toBe(newToken);
  } finally { release(); }
});
