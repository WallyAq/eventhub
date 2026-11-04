import { test, expect } from '@playwright/test';
import { captureParticipant, participant, participantEvent, participantFixture, paidActivity, freeActivity, registrationFor } from './participant-fixture';
import type { EventData } from '../src/services/business';

test('participant catalog uses real prices, accent-insensitive filters and six events per page', async ({ page }, info) => {
  test.setTimeout(90000);
  const events: EventData[] = [participantEvent, ...Array.from({ length: 7 }, (_, index) => ({
    ...participantEvent, id: 'catalog-event-' + (index + 2), title: 'Evento Acadêmico ' + (index + 2),
    featured: false, modality: index === 0 ? 'Online' : 'Presencial',
  })), { ...participantEvent, id: 'draft-hidden', title: 'Rascunho não publicado', featured: false, status: 'DRAFT' },
  { ...participantEvent, id: 'past-hidden', title: 'Evento encerrado', featured: false, startsAt: new Date(Date.now() - 86400000).toISOString() }];
  const state = await participantFixture(page, { events });
  await page.goto('/eventos');
  await expect(page.getByRole('heading', { name: 'Congresso em Destaque', exact: true })).toBeVisible();
  await expect(page.locator('.participant-event-card')).toHaveCount(6);
  await expect(page.getByRole('status')).toContainText('Mostrando 1 a 6 de 8');
  await expect(page.getByRole('heading', { name: 'Rascunho não publicado', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Evento encerrado', exact: true })).toHaveCount(0);
  await expect(page.locator('.participant-featured-card')).toContainText(/Gratuito.*R\$\s*50,00/);
  await expect(page.locator('.participant-featured-card').getByRole('link', { name: 'Inscreva-se', exact: true })).toHaveAttribute('href', '/eventos/' + participantEvent.id + '/inscricao');
  await captureParticipant(page, info, 'participant-catalog');
  await page.getByRole('button', { name: 'Página 2', exact: true }).click();
  await expect(page.locator('.participant-event-card')).toHaveCount(2);
  await expect(page.getByRole('status')).toContainText('Mostrando 7 a 8 de 8');
  await page.getByLabel('Buscar eventos', { exact: true }).fill('instituto academico qa');
  await expect(page.getByRole('status')).toContainText('Mostrando 1 a 6 de 8');
  await page.getByLabel('Modalidade', { exact: true }).selectOption({ label: 'Remoto' });
  await expect(page.locator('.participant-event-card')).toHaveCount(1);
  await expect(page.locator('.participant-event-card')).toContainText('Remoto');
  await page.getByLabel('Buscar eventos', { exact: true }).fill('evento que não existe');
  await expect(page.getByRole('heading', { name: 'Nenhum evento encontrado', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(page.locator('.participant-event-card')).toHaveCount(6);
  expect(state.unexpected).toEqual([]);
});

test('four-step checkout preserves selection and waits for server confirmation after payment approval', async ({ page }, info) => {
  test.setTimeout(120000);
  const state = await participantFixture(page, { autoConfirm: false });
  await page.goto('/eventos/' + participantEvent.id + '/inscricao');
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: freeActivity.title, exact: true }).check();
  await dialog.getByRole('radio', { name: paidActivity.title, exact: true }).check();
  await captureParticipant(page, info, 'checkout-1-activity');
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(dialog.getByLabel('Nome Completo', { exact: true })).toHaveValue(participant.name);
  await expect(dialog.getByLabel('E-mail', { exact: true })).toHaveValue(participant.email);
  const cpf = dialog.getByLabel('CPF', { exact: true });
  await expect(cpf).toHaveAttribute('readonly', '');
  const cpfValue = await cpf.inputValue();
  expect(cpfValue).toContain('*');
  expect(cpfValue.replace(/\D/g, '')).not.toBe(participant.cpf);
  await expect(dialog.getByRole('link', { name: 'Editar perfil', exact: true })).toHaveAttribute('href', '/perfil');
  await captureParticipant(page, info, 'checkout-2-personal-data');
  await dialog.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(dialog.getByRole('radio', { name: paidActivity.title, exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar e Continuar', exact: true }).click();
  await expect(page).toHaveURL(/\/pagamento\/registration-qa-1$/);
  expect(state.posts.filter(post => post.path === '/registrations')).toHaveLength(1);
  expect(state.posts[0].body).toEqual({ eventId: participantEvent.id, activityId: paidActivity.id });
  expect(state.posts[0].key).toBeTruthy();
  await expect(dialog.getByText(/R\$\s*50,00/).first()).toBeVisible();
  await expect(dialog).not.toContainText(/50% OFF|Desconto Institucional/);
  await dialog.getByRole('radio', { name: 'Cartão de Crédito', exact: true }).check();
  await dialog.getByRole('radio', { name: 'PIX', exact: true }).check();
  await captureParticipant(page, info, 'checkout-3-simulated-payment');
  await dialog.getByRole('button', { name: 'Simular pagamento', exact: true }).click();
  await expect.poll(() => state.posts.filter(post => post.path.startsWith('/payments/')).length).toBe(1);
  await expect(dialog.getByText('Aprovado', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Confirmada', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/Inscrição confirmada com sucesso/i)).toHaveCount(0);
  state.registrations[0].status = 'CONFIRMED'; state.registrations[0].expiresAt = null;
  await expect(dialog.getByText('Confirmada', { exact: true })).toBeVisible();
  await captureParticipant(page, info, 'checkout-4-confirmation');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/minhas-inscricoes$/);
  await expect(page.locator('.my-registration-activity')).toContainText(paidActivity.title);
  await captureParticipant(page, info, 'my-registrations-confirmed');
  expect(state.unexpected).toEqual([]);
});

test('duplicate enrollment is blocked and shows the existing registration', async ({ page }) => {
  const registration = registrationFor(freeActivity, 'CONFIRMED');
  const state = await participantFixture(page, { registrations: [registration] });
  await page.goto('/eventos/' + participantEvent.id + '/inscricao');
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await dialog.getByRole('radio', { name: freeActivity.title, exact: true }).check();
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar e Continuar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/pagamento/' + registration.id + '$'));
  await expect(dialog.getByText('Você já está inscrito nesta atividade. Não é possível fazer outra inscrição enquanto ela estiver ativa.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Você já está inscrito nesta atividade', exact: true })).toBeVisible();
  expect(state.registrations).toHaveLength(1);
  expect(state.registrations[0].id).toBe(registration.id);
  expect(state.posts.filter(post => post.path === '/registrations')).toHaveLength(1);
  expect(state.unexpected).toEqual([]);
});

for (const status of ['CONFIRMED', 'WAITLISTED'] as const) {
  test('free registration respects server state ' + status + ' and makes no payment request', async ({ page }) => {
    const state = await participantFixture(page, { reserveStatus: status });
    await page.goto('/eventos/' + participantEvent.id + '/inscricao');
    const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
    await dialog.getByRole('radio', { name: freeActivity.title, exact: true }).check();
    await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirmar e Continuar', exact: true }).click();
    await expect(page).toHaveURL(/\/pagamento\/registration-qa-1$/);
    await expect(dialog.getByText(status === 'CONFIRMED' ? 'Confirmada' : 'Lista de espera', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Simular pagamento', exact: true })).toHaveCount(0);
    if (status === 'WAITLISTED') await expect(dialog.getByText(/Inscrição confirmada com sucesso/i)).toHaveCount(0);
    expect(state.posts.filter(post => post.path.startsWith('/payments/'))).toHaveLength(0);
    expect(state.unexpected).toEqual([]);
  });
}

test('declined payment releases registration and never presents a success confirmation', async ({ page }) => {
  const registration = registrationFor();
  const state = await participantFixture(page, { registrations: [registration] });
  await page.goto('/pagamento/' + registration.id);
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await dialog.getByLabel('Resultado da simulação', { exact: true }).selectOption('DECLINED');
  await dialog.getByRole('button', { name: 'Simular pagamento', exact: true }).click();
  await expect(dialog.getByText('Pagamento: Recusado', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Cancelada', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Inscrição confirmada com sucesso/i)).toHaveCount(0);
  expect(state.registrations[0].status).toBe('CANCELLED');
  expect(state.unexpected).toEqual([]);
});

test('expired reservation blocks payment and exposes the actual expired state', async ({ page }) => {
  const registration = registrationFor(paidActivity, 'EXPIRED');
  const state = await participantFixture(page, { registrations: [registration] });
  await page.goto('/pagamento/' + registration.id);
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await expect(dialog.getByText('Expirada', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Simular pagamento', exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/Inscrição confirmada com sucesso/i)).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
  expect(state.unexpected).toEqual([]);
});

test('a passed server deadline blocks payment while waiting for the server to mark expiry', async ({ page }) => {
  const registration = registrationFor();
  registration.expiresAt = new Date(Date.now() - 1000).toISOString();
  const state = await participantFixture(page, { registrations: [registration] });
  await page.goto('/pagamento/' + registration.id);
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await expect(dialog.getByText('Aguardando pagamento', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Simular pagamento', exact: true })).toBeDisabled();
  await expect(dialog.locator('.participant-checkout__clock')).toContainText('0:00 min');
  await expect(dialog.getByText('Confirmada', { exact: true })).toHaveCount(0);
  state.registrations[0].status = 'EXPIRED'; state.registrations[0].expiresAt = null;
  await dialog.getByRole('button', { name: 'Consultar estado', exact: true }).click();
  await expect(dialog.getByText('Expirada', { exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(0);
  expect(state.unexpected).toEqual([]);
});

test('reservation response loss recovers the created reservation without a duplicate POST', async ({ page }) => {
  const state = await participantFixture(page, { reserveTransportFailure: true });
  await page.goto('/eventos/' + participantEvent.id + '/inscricao');
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await dialog.getByRole('radio', { name: paidActivity.title, exact: true }).check();
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar e Continuar', exact: true }).click();
  await expect(page).toHaveURL(/\/pagamento\/registration-qa-1$/);
  await expect(dialog.getByText('Aguardando pagamento', { exact: true })).toBeVisible();
  await page.reload();
  await expect(dialog.getByText('Aguardando pagamento', { exact: true })).toBeVisible();
  expect(state.posts.filter(post => post.path === '/registrations')).toHaveLength(1);
  expect(state.unexpected).toEqual([]);
});

test('payment response loss recovers server confirmation without charging a second time', async ({ page }) => {
  const registration = registrationFor();
  const state = await participantFixture(page, { registrations: [registration], paymentTransportFailure: true });
  await page.goto('/pagamento/' + registration.id);
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await dialog.getByRole('button', { name: 'Simular pagamento', exact: true }).click();
  await expect(dialog.getByText('Confirmada', { exact: true })).toBeVisible();
  expect(state.posts.filter(post => post.path.startsWith('/payments/'))).toHaveLength(1);
  expect(state.unexpected).toEqual([]);
});

test('my registrations filters real states and only cancels after explicit confirmation', async ({ page }, info) => {
  test.setTimeout(90000);
  const records = [
    registrationFor({ ...paidActivity, title: 'Oficina Confirmada' }, 'CONFIRMED', 'confirmed'),
    registrationFor({ ...paidActivity, title: 'Minicurso de Computação' }, 'PENDING_PAYMENT', 'pending'),
    registrationFor({ ...freeActivity, title: 'Palestra em Espera' }, 'WAITLISTED', 'waitlisted'),
    registrationFor({ ...paidActivity, title: 'Curso com Reserva Expirada' }, 'EXPIRED', 'expired'),
    registrationFor({ ...paidActivity, title: 'Workshop Cancelado' }, 'CANCELLED', 'cancelled'),
  ];
  const state = await participantFixture(page, { registrations: records });
  await page.goto('/minhas-inscricoes');
  const cards = page.locator('.my-registration-card');
  await expect(cards).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Continuar pagamento', exact: true })).toHaveAttribute('href', '/pagamento/registration-qa-pending');
  await expect(page.getByRole('link', { name: 'Ver ingresso', exact: true })).toHaveAttribute('href', '/inscricoes/registration-qa-confirmed');
  await captureParticipant(page, info, 'my-registrations-active');
  await page.getByRole('tab', { name: /Encerradas/ }).click();
  await expect(cards).toHaveCount(2);
  await page.getByLabel('Status da inscrição', { exact: true }).selectOption('EXPIRED');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('Expirada');
  await expect(page.getByRole('button', { name: 'Cancelar inscrição', exact: true })).toHaveCount(0);
  await page.getByLabel('Status da inscrição', { exact: true }).selectOption('');
  await captureParticipant(page, info, 'my-registrations-closed');
  await page.getByRole('tab', { name: /Inscrições Ativas/ }).click();
  await page.getByLabel('Buscar inscrições', { exact: true }).fill('inscrição que não existe');
  await expect(page.getByRole('heading', { name: 'Nenhuma inscrição encontrada', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await expect(cards).toHaveCount(3);
  await page.getByLabel('Buscar inscrições', { exact: true }).fill('computacao');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('Minicurso de Computação');
  await page.getByRole('button', { name: 'Cancelar inscrição', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Cancelar inscrição?', exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Voltar', exact: true }).click();
  expect(state.posts).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancelar inscrição', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect(confirm).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('Inscrição cancelada.');
  await expect(cards).toHaveCount(0);
  await page.getByRole('tab', { name: /Encerradas/ }).click();
  await expect(cards).toContainText('Cancelada');
  expect(state.posts.filter(post => post.path === '/registrations/registration-qa-pending/cancel')).toHaveLength(1);
  await expect(page.getByRole('link', { name: 'Continuar pagamento', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Ver inscrição', exact: true }).click();
  await expect(page).toHaveURL(/\/inscricoes\/registration-qa-pending$/);
  await expect(page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true }).getByText('Cancelada', { exact: true })).toBeVisible();
  expect(state.unexpected).toEqual([]);
});

test('my registrations distinguishes an empty account from empty filters', async ({ page }, info) => {
  await participantFixture(page);
  await page.goto('/minhas-inscricoes');
  await expect(page.getByRole('heading', { name: 'Você ainda não possui inscrições', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explorar eventos disponíveis', exact: true })).toHaveAttribute('href', '/eventos');
  await captureParticipant(page, info, 'my-registrations-empty');
});

test('waitlist promotion opens payment using the new reservation deadline without reloading', async ({ page }) => {
  const registration = registrationFor(paidActivity, 'WAITLISTED');
  const state = await participantFixture(page, { registrations: [registration] });
  await page.goto('/inscricoes/' + registration.id);
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await expect(dialog.getByText('Lista de espera', { exact: true })).toBeVisible();
  state.registrations[0].status = 'PENDING_PAYMENT';
  state.registrations[0].expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
  await expect(dialog.getByText('Aguardando pagamento', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Simular pagamento', exact: true })).toBeEnabled();
  await expect(dialog.locator('.participant-checkout__clock')).toContainText(/Reserva:.*(?:9|10):\d{2}/);
  await expect(dialog.getByText('Inscrição cancelada', { exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
  expect(state.unexpected).toEqual([]);
});

test('an older pending poll cannot overwrite a cancellation returned by the server', async ({ page }) => {
  const registration = registrationFor();
  const state = await participantFixture(page, { registrations: [registration] });
  await page.goto('/pagamento/' + registration.id);
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await expect(dialog.getByText('Aguardando pagamento', { exact: true })).toBeVisible();
  const oldResponse = JSON.stringify({ registration: { ...registration } });
  let release!: () => void, started!: () => void, held = false;
  const responseGate = new Promise<void>(resolve => { release = resolve; });
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/registrations/' + registration.id, async route => {
    if (route.request().method() !== 'GET' || held) return route.fallback();
    held = true; started();
    await responseGate;
    return route.fulfill({ status: 200, contentType: 'application/json', body: oldResponse });
  });
  try {
    await requestStarted;
    await dialog.getByRole('button', { name: 'Cancelar inscrição', exact: true }).click();
    await expect(dialog.getByText('Cancelada', { exact: true })).toBeVisible();
    const staleFinished = page.waitForResponse(response => response.url().endsWith('/api/registrations/' + registration.id) && response.request().method() === 'GET');
    const paymentFinished = page.waitForResponse(response => response.url().endsWith('/api/payments/' + registration.id) && response.request().method() === 'GET');
    release();
    await (await staleFinished).finished();
    await (await paymentFinished).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(dialog.getByText('Cancelada', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Aguardando pagamento', { exact: true })).toHaveCount(0);
    expect(state.posts.filter(post => post.path.endsWith('/cancel'))).toHaveLength(1);
    expect(state.unexpected).toEqual([]);
  } finally { release(); }
});

test('opening an unknown registration clears the previous receipt and all mutation actions', async ({ page }) => {
  const registration = registrationFor(paidActivity, 'CONFIRMED');
  const state = await participantFixture(page, { registrations: [registration] });
  await page.goto('/inscricoes/' + registration.id);
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await expect(dialog.getByText('Confirmada', { exact: true })).toBeVisible();
  // Exercise a client-side deep-link change so the same route component receives another id.
  await page.evaluate(() => { history.pushState({}, '', '/inscricoes/unknown-registration'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page).toHaveURL(/\/inscricoes\/unknown-registration$/);
  await expect(dialog.getByRole('alert')).toHaveText('Inscrição não encontrada.');
  await expect(dialog.getByText('Confirmada', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(paidActivity.title, { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Cancelar inscrição', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Simular pagamento', exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
  expect(state.unexpected).toEqual([]);
});

test('an approved payment remains visible and locked when its registration refresh fails', async ({ page }) => {
  const registration = registrationFor();
  const state = await participantFixture(page, { registrations: [registration], autoConfirm: false });
  state.payment = { registrationId: registration.id, amountCents: registration.priceCents, status: 'APPROVED' };
  let reads = 0;
  await page.route('**/api/registrations/' + registration.id, async route => {
    if (route.request().method() === 'GET' && ++reads === 2)
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Consulta da inscrição temporariamente indisponível.' }) });
    return route.fallback();
  });
  await page.goto('/pagamento/' + registration.id);
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await expect(dialog.getByText('Aprovado', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Aguardando pagamento', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Aguardando confirmação', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Simular pagamento', exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Confirmada', { exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
  expect(state.unexpected).toEqual([]);
});
