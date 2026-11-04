import { test, expect } from '@playwright/test';
import { captureParticipant, freeActivity, paidActivity, participantEvent, participantFixture } from './participant-fixture';
import type { EventData } from '../src/services/business';

const availabilityPath = '**/api/events/' + participantEvent.id + '/availability';
function available(event: EventData, remaining: number[]) {
  return {
    eventId: event.id, checkedAt: new Date().toISOString(),
    activities: event.activities.map((activity, index) => ({ activityId: activity.id, capacity: activity.capacity, availableSeats: remaining[index] })),
  };
}

test('activity details and checkout show remaining seats, including zero, without reserving on consultation', async ({ page }, info) => {
  test.setTimeout(90000);
  const state = await participantFixture(page, { reserveStatus: 'WAITLISTED' });
  await page.route(availabilityPath, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(available(participantEvent, [3, 0])) }));
  await page.goto('/eventos/' + participantEvent.id);
  const activityCards = page.locator('.participant-details__activity');
  await expect(activityCards.nth(0).locator('.activity-seats')).toHaveText('Vagas disponíveis: 3 de 12');
  await expect(activityCards.nth(1).locator('.activity-seats')).toHaveText('Vagas disponíveis: 0 de 12');
  expect(state.posts).toHaveLength(0);
  await captureParticipant(page, info, 'activity-availability-details');

  await activityCards.nth(1).getByRole('link', { name: 'Inscrever-se na atividade', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await expect(dialog.getByRole('radio', { name: freeActivity.title, exact: true })).toBeChecked();
  const choices = dialog.locator('.participant-checkout__activity');
  await expect(choices.nth(0).locator('.activity-seats')).toHaveText('Vagas disponíveis: 3 de 12');
  await expect(choices.nth(1).locator('.activity-seats')).toHaveText('Vagas disponíveis: 0 de 12');
  await expect(dialog.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  expect(state.posts).toHaveLength(0);
  await captureParticipant(page, info, 'activity-availability-checkout');
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(dialog).toContainText('Se as vagas estiverem ocupadas, você poderá entrar na lista de espera.');
  expect(state.posts).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Confirmar e Continuar', exact: true }).click();
  await expect(dialog.getByText('Lista de espera', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Confirmada', { exact: true })).toHaveCount(0);
  expect(state.posts.map(post => post.path)).toEqual(['/registrations']);
  expect(state.posts[0].body).toEqual({ eventId: participantEvent.id, activityId: freeActivity.id });
  expect(state.unexpected).toEqual([]);
});

for (const failure of ['unavailable', 'malformed'] as const) {
  test('availability ' + failure + ' never substitutes total capacity and recovers after an explicit refresh', async ({ page }) => {
    const state = await participantFixture(page);
    let recovered = false;
    await page.route(availabilityPath, route => {
      if (recovered) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(available(participantEvent, [2, 1])) });
      const body = failure === 'unavailable' ? { detail: 'Consulta temporariamente indisponível.' } : available(participantEvent, [paidActivity.capacity + 1, 0]);
      return route.fulfill({ status: failure === 'unavailable' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/eventos/' + participantEvent.id);
    const counts = page.locator('.participant-details__activity .activity-seats');
    await expect(counts).toHaveText(['Vagas disponíveis: consulta indisponível', 'Vagas disponíveis: consulta indisponível']);
    await expect(counts.locator('strong')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Atualizar vagas', exact: true })).toBeVisible();
    recovered = true;
    await page.getByRole('button', { name: 'Atualizar vagas', exact: true }).click();
    await expect(counts).toHaveText(['Vagas disponíveis: 2 de 12', 'Vagas disponíveis: 1 de 12']);
    await expect(page.getByRole('button', { name: 'Atualizar vagas', exact: true })).toHaveCount(0);

    recovered = false;
    await page.getByRole('link', { name: 'Inscreva-se', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
    const selectionCounts = dialog.locator('.activity-seats');
    await expect(selectionCounts).toHaveText(['Vagas disponíveis: consulta indisponível', 'Vagas disponíveis: consulta indisponível']);
    await expect(selectionCounts.locator('strong')).toHaveCount(0);
    recovered = true;
    await dialog.getByRole('button', { name: 'Atualizar vagas', exact: true }).click();
    await expect(selectionCounts).toHaveText(['Vagas disponíveis: 2 de 12', 'Vagas disponíveis: 1 de 12']);
    expect(state.posts).toHaveLength(0);
    expect(state.unexpected).toEqual([]);
  });
}

test('availability refreshes after thirty seconds and on focus, discarding counts after a failed refresh', async ({ page }) => {
  const state = await participantFixture(page);
  await page.clock.install({ time: Date.now() });
  let remaining = [8, 5], fail = false, reads = 0;
  await page.route(availabilityPath, route => {
    reads++;
    return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { detail: 'Consulta indisponível.' } : available(participantEvent, remaining)) });
  });
  await page.goto('/eventos/' + participantEvent.id);
  const counts = page.locator('.participant-details__activity .activity-seats');
  await expect(counts).toHaveText(['Vagas disponíveis: 8 de 12', 'Vagas disponíveis: 5 de 12']);
  const initialReads = reads;
  remaining = [4, 2];
  await page.clock.fastForward(30001);
  await expect(counts).toHaveText(['Vagas disponíveis: 4 de 12', 'Vagas disponíveis: 2 de 12']);
  expect(reads).toBeGreaterThan(initialReads);
  remaining = [1, 0];
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(counts).toHaveText(['Vagas disponíveis: 1 de 12', 'Vagas disponíveis: 0 de 12']);
  fail = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(counts).toHaveText(['Vagas disponíveis: consulta indisponível', 'Vagas disponíveis: consulta indisponível']);
  await expect(counts.locator('strong')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Atualizar vagas', exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(0);
  expect(state.unexpected).toEqual([]);
});

test('an availability response from the previous event cannot replace the current event counts', async ({ page }) => {
  const otherEvent: EventData = {
    ...participantEvent, id: 'availability-event-other', title: 'Outro evento com vagas próprias',
    activities: [{ ...paidActivity, id: 'availability-activity-other', title: 'Atividade do outro evento', capacity: 20 }],
  };
  const state = await participantFixture(page, { events: [participantEvent, otherEvent] });
  let started!: () => void, release!: () => void, finished!: () => void;
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  const responseGate = new Promise<void>(resolve => { release = resolve; });
  const handlerFinished = new Promise<void>(resolve => { finished = resolve; });
  await page.route(availabilityPath, async route => {
    started();
    await responseGate;
    try {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(available(participantEvent, [11, 10])) });
    } finally { finished(); }
  });
  await page.route('**/api/events/' + otherEvent.id + '/availability', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(available(otherEvent, [6])) }));
  try {
    await page.goto('/eventos/' + participantEvent.id);
    await requestStarted;
    await page.evaluate(path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')); }, '/eventos/' + otherEvent.id);
    await expect(page.getByRole('heading', { name: otherEvent.title, exact: true })).toBeVisible();
    const counts = page.locator('.participant-details__activity .activity-seats');
    await expect(counts).toHaveText(['Vagas disponíveis: 6 de 20']);
    release();
    await handlerFinished;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(counts).toHaveText(['Vagas disponíveis: 6 de 20']);
    await expect(page.locator('.participant-details__activity')).toHaveCount(1);
    expect(state.posts).toHaveLength(0);
    expect(state.unexpected).toEqual([]);
  } finally { release(); }
});
