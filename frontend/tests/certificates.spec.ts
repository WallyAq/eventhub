import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { paidActivity, participantFixture, registrationFor } from './participant-fixture';

const certificateId = '7f57e487-7fe6-4cbe-9ce8-a1dd71512c7f';
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');

async function completedRegistration(page: Page) {
  const ended = registrationFor({ ...paidActivity,
    startsAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    endsAt: new Date(Date.now() - 3600000).toISOString(),
  }, 'CONFIRMED', 'certificate');
  const state = await participantFixture(page, { registrations: [ended] });
  return { ended, state };
}

async function openHistory(page: Page) {
  await page.goto('/minhas-inscricoes');
  await page.getByRole('tab', { name: /Cursos Concluídos/ }).click();
  await expect(page.getByRole('button', { name: 'Baixar Certificado (PDF)', exact: true })).toBeEnabled();
}

test('certificate is requested only on click and repeated PDF downloads reuse the issued certificate', async ({ page }, info) => {
  const { ended, state } = await completedRegistration(page);
  const issued = new Map<string, string>();
  let posts = 0, downloads = 0;
  await page.route('**/api/certificates', async route => {
    posts++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    const body = route.request().postDataJSON();
    expect(body).toEqual({ registrationId: ended.id });
    issued.set(body.registrationId, issued.get(body.registrationId) || certificateId);
    await route.fulfill({ status: 201, contentType: 'application/json',
      body: JSON.stringify({ certificate: { id: issued.get(body.registrationId), registrationId: body.registrationId } }) });
  });
  await page.route('**/api/certificates/*/download', async route => {
    downloads++;
    expect(route.request().method()).toBe('GET');
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    expect(route.request().url()).toContain('/certificates/' + certificateId + '/download');
    await route.fulfill({ contentType: 'application/pdf', body: pdf });
  });
  await openHistory(page);
  expect(posts).toBe(0);
  for (let attempt = 0; attempt < 2; attempt++) {
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar Certificado (PDF)', exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe('certificado-' + certificateId + '.pdf');
    const path = info.outputPath('certificate-' + attempt + '.pdf');
    await download.saveAs(path);
    expect((await readFile(path)).subarray(0, 5).toString()).toBe('%PDF-');
    await expect(page.getByRole('status')).toHaveText('Certificado pronto. O download do PDF foi iniciado.');
  }
  expect(posts).toBe(1);
  expect(downloads).toBe(2);
  expect(issued.size).toBe(1);
  expect(state.unexpected).toEqual([]);
});

test('ended activity without attendance shows the server eligibility failure and allows retry', async ({ page }) => {
  const { ended, state } = await completedRegistration(page);
  let present = false, posts = 0, downloads = 0;
  await page.route('**/api/certificates', async route => {
    posts++;
    await route.fulfill({ status: present ? 201 : 409, contentType: 'application/json', body: JSON.stringify(present
      ? { certificate: { id: certificateId, registrationId: ended.id } }
      : { detail: { code: 'ATTENDANCE_REQUIRED', message: 'Presença necessária.' } }) });
  });
  await page.route('**/api/certificates/*/download', async route => {
    downloads++;
    await route.fulfill({ contentType: 'application/pdf', body: pdf });
  });
  await openHistory(page);
  await page.getByRole('button', { name: 'Baixar Certificado (PDF)', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Sua presença nesta atividade ainda não foi registrada. Solicite o credenciamento à organização para liberar o certificado.');
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(downloads).toBe(0);
  await expect(page.getByRole('button', { name: 'Baixar Certificado (PDF)', exact: true })).toBeEnabled();
  present = true;
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar Certificado (PDF)', exact: true }).click();
  await downloadEvent;
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(posts).toBe(2);
  expect(downloads).toBe(1);
  expect(state.unexpected).toEqual([]);
});

test('a connection failure does not claim issuance and the action can be retried', async ({ page }) => {
  const { ended, state } = await completedRegistration(page);
  let online = false, posts = 0;
  await page.route('**/api/certificates', async route => {
    posts++;
    if (!online) return route.abort('failed');
    await route.fulfill({ status: 201, contentType: 'application/json',
      body: JSON.stringify({ certificate: { id: certificateId, registrationId: ended.id } }) });
  });
  await page.route('**/api/certificates/*/download', route => route.fulfill({ contentType: 'application/pdf', body: pdf }));
  await openHistory(page);
  await page.getByRole('button', { name: 'Baixar Certificado (PDF)', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Não foi possível conectar ao serviço. Tente novamente.');
  await expect(page.getByRole('status')).toHaveCount(0);
  online = true;
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar Certificado (PDF)', exact: true }).click();
  await downloadEvent;
  expect(posts).toBe(2);
  expect(state.unexpected).toEqual([]);
});

test('failed PDF retrieval retries the same certificate without issuing again', async ({ page }) => {
  const { ended, state } = await completedRegistration(page);
  let posts = 0, downloads = 0;
  await page.route('**/api/certificates', async route => {
    posts++;
    await route.fulfill({ status: 201, contentType: 'application/json',
      body: JSON.stringify({ certificate: { id: certificateId, registrationId: ended.id } }) });
  });
  await page.route('**/api/certificates/*/download', async route => {
    downloads++;
    if (downloads === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Unavailable' }) });
    await route.fulfill({ contentType: 'application/pdf', body: pdf });
  });
  await openHistory(page);
  await page.getByRole('button', { name: 'Baixar Certificado (PDF)', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('O serviço de certificados está temporariamente indisponível. Tente novamente.');
  await expect(page.getByRole('status')).toHaveCount(0);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar Certificado (PDF)', exact: true }).click();
  await downloadEvent;
  expect(posts).toBe(1);
  expect(downloads).toBe(2);
  expect(state.unexpected).toEqual([]);
});

test('duplicate clicks share one operation and navigation suppresses the old response', async ({ page }) => {
  const { ended, state } = await completedRegistration(page);
  let release!: () => void, finish!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const finished = new Promise<void>(resolve => { finish = resolve; });
  let posts = 0, downloads = 0, browserDownloads = 0;
  page.on('download', () => browserDownloads++);
  await page.route('**/api/certificates', async route => {
    posts++;
    await released;
    try {
      await route.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ certificate: { id: certificateId, registrationId: ended.id } }) });
    } catch { /* The leaving page aborts the request intentionally. */ }
    finally { finish(); }
  });
  await page.route('**/api/certificates/*/download', async route => {
    downloads++;
    await route.fulfill({ contentType: 'application/pdf', body: pdf });
  });
  await openHistory(page);
  const button = page.getByRole('button', { name: 'Baixar Certificado (PDF)', exact: true });
  await button.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect.poll(() => posts).toBe(1);
  await expect(page.getByRole('button', { name: 'Preparando PDF…', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Explorar eventos', exact: true }).click();
  await expect(page).toHaveURL('/eventos');
  release();
  await finished;
  expect(downloads).toBe(0);
  expect(browserDownloads).toBe(0);
  expect(state.unexpected).toEqual([]);
});
