import { test, expect } from '@playwright/test';
import QRCode from 'qrcode';
import { participantFixture, participantEvent, registrationFor } from './participant-fixture';

test.use({ reducedMotion: 'reduce' });
const credential = 'eventhub:check-in:v1:48b3c658-ef22-475f-a9d7-c0b458514342:' + 'a'.repeat(64);
const template = { title: 'CERTIFICADO DE PARTICIPAÇÃO', speakerTitle: 'CERTIFICADO DE PALESTRANTE', body: 'Certificamos que {{name}} participou de {{activity}}.', speakerBody: 'Certificamos que {{name}} ministrou {{activity}}.', accentColor: '#4f46e5', background: '', signatories: [] as { name: string; role: string; image: string }[] };

test('QR por imagem e câmera negada: conferir participante antes de registrar presença', async ({ page }, info) => {
  await participantFixture(page);
  await page.addInitScript(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('Denied', 'NotAllowedError'); } }));
  const registration = registrationFor(participantEvent.activities[0], 'CONFIRMED');
  let checkIns = 0;
  await page.route('**/api/organizer/**', route => route.fulfill({ json: { registrations: [], total: 0 } }));
  await page.route('**/api/attendance/credentials/resolve', async route => {
    expect(route.request().postDataJSON()).toEqual({ eventId: participantEvent.id, activityId: registration.activityId, credential });
    await route.fulfill({ json: { registration: { ...registration, participant: { name: 'Pessoa da Credencial', email: 'credencial@example.test' } }, attendance: null } });
  });
  await page.route('**/api/attendance/check-ins', async route => { checkIns++; expect(route.request().postDataJSON()).toEqual({ registrationId: registration.id }); await route.fulfill({ json: { attendance: {} } }); });
  await page.goto('/organizacao/eventos/' + participantEvent.id + '/gestao');
  await page.getByRole('button', { name: 'Atividades e check-in', exact: true }).click();
  await page.getByRole('button', { name: 'Ler QR Code', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Ler QR Code e validar presença' });
  await dialog.getByRole('button', { name: 'Ativar câmera' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Permissão de câmera negada');
  await dialog.getByLabel('Ou cole o conteúdo da credencial').fill('https://example.test/not-a-credential');
  await dialog.getByRole('button', { name: 'Consultar credencial' }).click();
  await expect(dialog.getByRole('alert')).toContainText('não é uma credencial');
  const png = await QRCode.toBuffer(credential, { width: 500, margin: 4 });
  await dialog.getByLabel('Imagem do QR Code').setInputFiles({ name: 'credencial.png', mimeType: 'image/png', buffer: png });
  await expect(dialog.getByRole('heading', { name: 'Pessoa da Credencial' })).toBeVisible();
  expect(checkIns).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('qr-preview-mobile.png') });
  await dialog.getByRole('button', { name: 'Confirmar presença' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Presença registrada com sucesso.');
  await expect(dialog.getByRole('button', { name: 'Confirmar presença' })).toBeDisabled();
  expect(checkIns).toBe(1);
});

test('fechar leitura durante permissão pendente encerra a câmera quando a resposta chega', async ({ page }) => {
  await participantFixture(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => new Promise(resolve => {
      (window as unknown as { finishCamera: () => void }).finishCamera = () => resolve({ getTracks: () => [{ stop: () => { document.documentElement.dataset.cameraStopped = 'true'; } }] });
    }) });
  });
  await page.route('**/api/organizer/**', route => route.fulfill({ json: { registrations: [], total: 0 } }));
  await page.goto('/organizacao/eventos/' + participantEvent.id + '/gestao');
  await page.getByRole('button', { name: 'Atividades e check-in', exact: true }).click();
  await page.getByRole('button', { name: 'Ler QR Code', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Ler QR Code e validar presença' });
  await dialog.getByRole('button', { name: 'Ativar câmera' }).click();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.evaluate(() => (window as unknown as { finishCamera: () => void }).finishCamera());
  await expect(page.locator('html')).toHaveAttribute('data-camera-stopped', 'true');
  await expect(dialog).toHaveCount(0);
});

test('editor persiste lotes/categorias e opção de emissão automática com o palestrante vinculado', async ({ page }, info) => {
  await participantFixture(page);
  let payload: any;
  const event = { ...participantEvent, status: 'DRAFT', speakers: [{ ...participantEvent.speakers[0], id: '61e9c018-589b-458d-952e-1217fcb0769c' }], activities: [participantEvent.activities[0]] };
  await page.route('**/api/organizations**', route => route.fulfill({ json: { organizations: [{ id: event.organizationId, name: event.organizationName }] } }));
  await page.route('**/api/events/' + event.id + '**', async route => {
    if (route.request().method() === 'PUT') payload = route.request().postDataJSON();
    await route.fulfill({ json: { event: payload ? { ...event, ...payload } : event } });
  });
  await page.goto('/organizacao/eventos/' + event.id);
  await page.getByRole('button', { name: 'Editar atividade 1', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar Atividade do Evento' });
  await dialog.getByRole('button', { name: 'Adicionar lote/categoria' }).click();
  await dialog.getByLabel('Nome do lote').fill('Primeiro lote');
  await dialog.getByLabel('Categoria', { exact: true }).fill('Graduação');
  await dialog.getByLabel('Preço em reais').fill('35.50');
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByLabel('Nome do lote').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('price-option-mobile.png') });
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('checkbox', { name: /Gerar automaticamente certificado/ }).check();
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect.poll(() => payload?.autoSpeakerCertificates).toBe(true);
  expect(payload.activities[0].priceOptions[0]).toMatchObject({ lotName: 'Primeiro lote', category: 'Graduação', priceCents: 3550 });
  expect(payload.activities[0].speakerId).toBe(event.speakers[0].id);
});

test('inscrição exige lote aberto e envia somente seu identificador ao reservar', async ({ page }) => {
  const rate = { id: '61e9c018-589b-458d-952e-1217fcb0769c', lotName: 'Lote atual', category: 'Graduação', priceCents: 3550, startsAt: new Date(Date.now() - 86400000).toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() };
  const activity = { ...participantEvent.activities[0], priceOptions: [rate, { ...rate, id: 'expired', lotName: 'Lote encerrado', endsAt: new Date(Date.now() - 1000).toISOString() }] };
  const event = { ...participantEvent, activities: [activity] };
  const state = await participantFixture(page, { events: [event] });
  let request: any;
  await page.route('**/api/registrations', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    request = route.request().postDataJSON();
    const registration = { ...registrationFor(activity), priceCents: rate.priceCents, priceOption: rate };
    state.registrations = [registration]; await route.fulfill({ status: 201, json: { registration } });
  });
  await page.goto('/eventos/' + event.id + '/inscricao');
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade' });
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Confirmar e Continuar' })).toBeDisabled();
  await expect(dialog.getByRole('option', { name: /Lote encerrado/ })).toHaveCount(0);
  await dialog.getByLabel('Lote e categoria de preço').selectOption(rate.id);
  await expect(dialog.getByText(/Valor da inscrição: R\$\s*35,50/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar e Continuar' }).click();
  await expect.poll(() => request).toEqual({ eventId: event.id, activityId: activity.id, priceOptionId: rate.id });
  await expect(dialog.getByRole('heading', { name: 'Resumo da sua inscrição e pagamento:' })).toHaveCount(0);
  await expect(dialog.getByLabel('Resumo da inscrição')).toContainText(/35,50/);
});

test('modelo personalizado: imagens, signatários, prévias PDF e emissão de palestrantes', async ({ page }, info) => {
  await participantFixture(page, { events: [{ ...participantEvent, autoSpeakerCertificates: true }] });
  let saved: any, issued = false;
  const pdf = Buffer.from('%PDF-1.4\nfixture');
  await page.route('**/api/organizer/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/certificate-settings')) {
      if (route.request().method() === 'PUT') saved = route.request().postDataJSON();
      return route.fulfill({ json: { settings: saved || template } });
    }
    if (path.endsWith('/certificate-preview')) return route.fulfill({ contentType: 'application/pdf', body: pdf });
    if (path.endsWith('/speaker-certificates')) {
      if (route.request().method() === 'POST') { issued = true; return route.fulfill({ json: { issued: 1 } }); }
      return route.fulfill({ json: { certificates: issued ? [{ id: 'speaker-cert', participantName: 'Dra. Helena QA', activityTitle: 'Oficina', issuedAt: new Date().toISOString(), valid: true }] : [] } });
    }
    return route.fulfill({ json: { registrations: [], total: 0 } });
  });
  await page.route('**/api/speaker-certificates/*/download', route => route.fulfill({ contentType: 'application/pdf', body: pdf }));
  await page.goto('/organizacao/eventos/' + participantEvent.id + '/gestao');
  await page.getByRole('button', { name: 'Configurações do evento', exact: true }).click();
  await page.getByLabel('Título do certificado de participante').fill('CERTIFICADO PERSONALIZADO');
  await page.getByRole('button', { name: 'Adicionar signatário' }).click();
  await page.getByLabel('Nome do signatário', { exact: true }).fill('Ana Coordenadora');
  await page.getByLabel('Cargo do signatário', { exact: true }).fill('Coordenação acadêmica');
  const image = { name: 'imagem.png', mimeType: 'image/png', buffer: await QRCode.toBuffer('imagem de teste', { width: 120 }) };
  await page.getByLabel('Imagem da assinatura', { exact: true }).setInputFiles(image);
  await expect(page.getByAltText('Assinatura de Ana Coordenadora')).toBeVisible();
  await page.getByLabel('Imagem de fundo (PNG ou JPEG)').setInputFiles(image);
  await expect(page.getByAltText('Fundo escolhido para o certificado')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar modelo', exact: true }).click();
  await expect.poll(() => saved?.title).toBe('CERTIFICADO PERSONALIZADO');
  expect(saved.signatories[0]).toMatchObject({ name: 'Ana Coordenadora', role: 'Coordenação acadêmica' });
  expect(saved.signatories[0].image).toMatch(/^data:image\/png;base64,/);
  expect(saved.background).toMatch(/^data:image\/jpeg;base64,/);
  await expect(page.getByRole('status')).toContainText('Modelo salvo');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Prévia do palestrante (PDF)' }).click();
  expect((await download).suggestedFilename()).toBe('previa-palestrante.pdf');
  await page.getByRole('button', { name: 'Verificar emissões agora' }).click();
  await expect(page.getByRole('button', { name: 'Baixar certificado', exact: true })).toBeVisible();
  const speakerDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar certificado', exact: true }).click();
  expect((await speakerDownload).suggestedFilename()).toBe('certificado-palestrante-speaker-cert.pdf');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('certificate-settings-mobile.png'), fullPage: true });
});
