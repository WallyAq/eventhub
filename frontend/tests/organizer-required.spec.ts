import { test, expect } from '@playwright/test';
import { participantFixture, participantEvent } from './participant-fixture';

test('acesso institucional sinaliza obrigatórios sem alterar os nomes acessíveis', async ({ page }) => {
  await page.goto('/organizacao/login');
  for (const id of ['login-email', 'login-password']) {
    await expect(page.locator('#' + id)).toHaveAttribute('required', '');
    await expect(page.locator(`label[for="${id}"] .required-mark`)).toHaveCSS('color', 'rgb(186, 26, 26)');
  }
  await expect(page.getByLabel('Senha', { exact: true })).toBeVisible();
  await page.goto('/organizacao/cadastro');
  for (const id of ['register-cnpj', 'register-name', 'register-trade-name', 'register-entity', 'register-phone', 'register-email', 'register-password', 'register-confirmation']) {
    await expect(page.locator(`label[for="${id}"] .required-mark`)).toHaveCount(1);
  }
  await page.goto('/participante/cadastro');
  await expect(page.locator('label[for="register-phone"] .required-mark')).toHaveCount(0);
  await expect(page.locator('#register-phone')).not.toHaveAttribute('required');
  await page.goto('/recuperar-senha?area=organization');
  await expect(page.locator('label[for="recovery-email"] .required-mark')).toBeVisible();
});

test('editor mantém obrigatoriedade condicional e bloqueia atividade incompleta', async ({ page }, info) => {
  await participantFixture(page);
  await page.route('**/api/organizations**', route => route.fulfill({ json: { organizations: [{ id: participantEvent.organizationId, name: 'Instituto QA', membershipRole: 'OWNER' }] } }));
  await page.goto('/organizacao/eventos/novo');
  for (const id of ['event-org', 'event-title', 'event-category', 'event-hours', 'event-description', 'event-start', 'event-end']) {
    await expect(page.locator(`label[for="${id}"] .required-mark`)).toBeVisible();
  }
  const location = page.locator('label[for="event-location"] .required-mark');
  const url = page.locator('label[for="event-url"] .required-mark');
  await expect(location).toBeVisible();
  await expect(url).toHaveCount(0);
  await page.getByRole('radio', { name: /100% Online/ }).check();
  await expect(location).toHaveCount(0);
  await expect(page.locator('#event-location')).not.toHaveAttribute('required');
  await expect(url).toBeVisible();
  await expect(page.locator('#event-url')).toHaveAttribute('required', '');
  await page.getByRole('radio', { name: /Híbrido/ }).check();
  await expect(location).toBeVisible();
  await expect(url).toBeVisible();
  await expect(page.locator('label[for="event-session"] .required-mark')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('organizer-required-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Adicionar Minicurso/Oficina' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova Atividade do Evento' });
  await dialog.getByRole('radio', { name: 'Não', exact: true }).check();
  const price = dialog.getByLabel('Valor da inscrição');
  await expect(price).toHaveAttribute('required', '');
  await expect(dialog.locator('label').filter({ hasText: 'Valor da inscrição' }).locator('.required-mark')).toBeVisible();
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await dialog.getByLabel('Nome da atividade').evaluate(input => (input as HTMLInputElement).validity.valueMissing)).toBe(true);
  await dialog.getByRole('radio', { name: 'Sim', exact: true }).check();
  await expect(price).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('organizer-required-mobile.png'), fullPage: true });
});
