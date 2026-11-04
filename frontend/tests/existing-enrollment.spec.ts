import { test, expect } from '@playwright/test';
import { captureParticipant, freeActivity, paidActivity, participantEvent, participantFixture, registrationFor } from './participant-fixture';

const detailsPath = '/eventos/' + participantEvent.id;
const checkoutPath = detailsPath + '/inscricao';

test('event details expose the existing receipt before starting another enrollment', async ({ page }, info) => {
  test.setTimeout(90000);
  const registration = registrationFor(paidActivity, 'CONFIRMED');
  const state = await participantFixture(page, { registrations: [registration] });
  await page.goto(detailsPath);
  const enrolledActivity = page.locator('.participant-details__activity').filter({ has: page.getByRole('heading', { name: paidActivity.title, exact: true }) });
  await expect(enrolledActivity.getByText('Você já está inscrito nesta atividade.', { exact: true })).toBeVisible();
  await expect(enrolledActivity.getByRole('link', { name: 'Ver comprovante', exact: true })).toHaveAttribute('href', '/inscricoes/' + registration.id);
  await expect(enrolledActivity.getByRole('link', { name: 'Inscrever-se na atividade', exact: true })).toHaveCount(0);
  await expect(page.locator('.participant-details__activity').nth(1).getByRole('link', { name: 'Inscrever-se na atividade', exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(0);
  await captureParticipant(page, info, 'existing-enrollment-details');
  await enrolledActivity.getByRole('link', { name: 'Ver comprovante', exact: true }).click();
  await expect(page).toHaveURL('/inscricoes/' + registration.id);
  await expect(page.getByRole('article', { name: 'Comprovante de inscrição', exact: true })).toContainText(registration.id);
  expect(state.posts).toHaveLength(0);
  expect(state.unexpected).toEqual([]);
});

for (const scenario of [
  { status: 'PENDING_PAYMENT' as const, message: 'Você já possui uma reserva aguardando pagamento.', action: 'Continuar pagamento', label: 'Aguardando pagamento' },
  { status: 'WAITLISTED' as const, message: 'Você já está na lista de espera desta atividade.', action: 'Ver lista de espera', label: 'Lista de espera' },
]) {
  test('existing ' + scenario.status + ' is shown before personal data without claiming a confirmed seat', async ({ page }) => {
    const registration = registrationFor(paidActivity, scenario.status);
    const state = await participantFixture(page, { registrations: [registration] });
    await page.goto(detailsPath);
    const enrolledActivity = page.locator('.participant-details__activity').first();
    await expect(enrolledActivity.getByText(scenario.message, { exact: true })).toBeVisible();
    await expect(enrolledActivity.getByRole('link', { name: scenario.action, exact: true })).toHaveAttribute('href', '/pagamento/' + registration.id);

    await page.goto(checkoutPath);
    const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
    await expect(dialog.getByRole('radio', { name: paidActivity.title, exact: true })).toBeChecked();
    await expect(dialog.getByText(scenario.message, { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('Nome Completo', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('Confirmada', { exact: true })).toHaveCount(0);
    expect(state.posts).toHaveLength(0);

    // An enrollment in one activity must not block another activity in the event.
    await dialog.getByRole('radio', { name: freeActivity.title, exact: true }).check();
    await expect(dialog.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
    await dialog.getByRole('radio', { name: paidActivity.title, exact: true }).check();
    await dialog.getByRole('button', { name: scenario.action, exact: true }).click();
    await expect(page).toHaveURL('/pagamento/' + registration.id);
    await expect(dialog.getByText(scenario.label, { exact: true })).toBeVisible();
    await expect(dialog.getByText('Confirmada', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('heading', { name: 'Inscrição confirmada com sucesso!', exact: true })).toHaveCount(0);
    expect(state.posts).toHaveLength(0);
    expect(state.registrations).toHaveLength(1);
    expect(state.unexpected).toEqual([]);
  });
}

for (const status of ['CANCELLED', 'EXPIRED', 'PENDING_PAYMENT'] as const) {
  test('inactive ' + status + ' does not block a new enrollment', async ({ page }) => {
    const registration = registrationFor(paidActivity, status);
    if (status === 'PENDING_PAYMENT') registration.expiresAt = new Date(Date.now() - 60000).toISOString();
    const state = await participantFixture(page, { registrations: [registration] });
    await page.goto(checkoutPath);
    const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
    await expect(dialog.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
    await expect(dialog.locator('.existing-registration-notice')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(dialog.getByLabel('Nome Completo', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Confirmar e Continuar', exact: true })).toBeEnabled();
    expect(state.posts).toHaveLength(0);
    expect(state.unexpected).toEqual([]);
  });
}

test('the activity cannot advance while its existing enrollment lookup is pending', async ({ page }) => {
  const registration = registrationFor(paidActivity, 'CONFIRMED');
  const state = await participantFixture(page, { registrations: [registration] });
  let started!: () => void, release!: () => void;
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  const responseGate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/registrations', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    started();
    await responseGate;
    await route.fallback();
  });
  try {
    await page.goto(checkoutPath);
    await requestStarted;
    const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
    await expect(dialog.getByText('Consultando suas inscrições…', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('Nome Completo', { exact: true })).toHaveCount(0);
    expect(state.posts).toHaveLength(0);
    release();
    await expect(dialog.getByText('Você já está inscrito nesta atividade.', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Ver comprovante', exact: true })).toBeEnabled();
    expect(state.posts).toHaveLength(0);
    expect(state.unexpected).toEqual([]);
  } finally { release(); }
});

test('a failed enrollment lookup blocks advancement and can be retried without reserving', async ({ page }) => {
  const registration = registrationFor(paidActivity, 'CONFIRMED');
  const state = await participantFixture(page, { registrations: [registration] });
  let available = false;
  await page.route('**/api/registrations', route => {
    if (route.request().method() !== 'GET' || available) return route.fallback();
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Consulta temporariamente indisponível.' }) });
  });
  await page.goto(checkoutPath);
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await expect(dialog.getByRole('alert')).toContainText('Não foi possível consultar suas inscrições.');
  await expect(dialog.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Nome Completo', { exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
  available = true;
  await dialog.getByRole('button', { name: 'Consultar inscrições novamente', exact: true }).click();
  await expect(dialog.getByText('Você já está inscrito nesta atividade.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Ver comprovante', exact: true })).toBeEnabled();
  expect(state.posts).toHaveLength(0);
  expect(state.unexpected).toEqual([]);
});

test('an enrollment created after activity selection is found before any reservation write', async ({ page }) => {
  const state = await participantFixture(page);
  await page.goto(checkoutPath);
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(dialog.getByLabel('Nome Completo', { exact: true })).toBeVisible();
  const registration = registrationFor(paidActivity, 'CONFIRMED', 'other-tab');
  state.registrations = [registration];
  await dialog.getByRole('button', { name: 'Confirmar e Continuar', exact: true }).click();
  await expect(page).toHaveURL('/pagamento/' + registration.id);
  await expect(dialog.getByRole('heading', { name: 'Você já está inscrito nesta atividade', exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(0);
  expect(state.registrations).toHaveLength(1);
  expect(state.unexpected).toEqual([]);
});
