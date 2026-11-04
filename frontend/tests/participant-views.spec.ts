import { test, expect } from '@playwright/test';
import { captureParticipant, participant, participantEvent, participantFixture, paidActivity, freeActivity, registrationFor } from './participant-fixture';

test('participant profile starts in read mode, cancels drafts and saves before returning to read mode', async ({ page }, info) => {
  test.setTimeout(90000);
  const state = await participantFixture(page);
  let user = { ...participant };
  const patches: unknown[] = [];
  await page.route('**/api/users/me', async route => {
    if (route.request().method() === 'PATCH') {
      const patch = route.request().postDataJSON();
      patches.push(patch); user = { ...user, ...patch };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user }) });
  });
  await page.goto('/perfil');
  const profile = page.locator('.profile-card');
  await expect(profile.getByRole('heading', { name: 'Dados da Conta', exact: true })).toBeVisible();
  await expect(profile).toContainText(participant.name);
  await expect(profile).toContainText('529.982.247-25');
  await expect(profile).toContainText('(85) 91234-5678');
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Senha atual', { exact: true })).toHaveCount(0);
  await captureParticipant(page, info, 'participant-profile-readonly');
  await page.getByRole('button', { name: 'Editar Perfil', exact: true }).click();
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveAttribute('readonly', '');
  await page.getByLabel('Nome completo', { exact: true }).fill('Rascunho descartado');
  await page.getByLabel('Telefone', { exact: true }).fill('85900000000');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(patches).toHaveLength(0);
  await expect(profile).not.toContainText('Rascunho descartado');
  await page.getByRole('button', { name: 'Editar Perfil', exact: true }).click();
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue(participant.name);
  await expect(page.getByLabel('Telefone', { exact: true })).toHaveValue(participant.phone!);
  await page.getByLabel('Nome completo', { exact: true }).fill('Participante Atualizado');
  await captureParticipant(page, info, 'participant-profile-edit');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Dados atualizados.');
  await expect(profile).toContainText('Participante Atualizado');
  expect(patches).toEqual([{ name: 'Participante Atualizado', cpf: participant.cpf, phone: participant.phone }]);
  await page.getByRole('button', { name: 'Alterar Senha', exact: true }).click();
  await expect(page.getByLabel('Senha atual', { exact: true })).toBeVisible();
  await captureParticipant(page, info, 'participant-profile-password');
  await page.getByLabel('Senha atual', { exact: true }).fill('Segredo123');
  await page.getByRole('button', { name: 'Cancelar troca de senha', exact: true }).click();
  await expect(page.getByLabel('Senha atual', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Alterar Senha', exact: true }).click();
  await expect(page.getByLabel('Senha atual', { exact: true })).toHaveValue('');
  await page.reload();
  await expect(profile).toContainText('Participante Atualizado');
  expect(state.unexpected).toEqual([]);
});

test('a failed profile load offers retry without saving a guessed profile', async ({ page }) => {
  await participantFixture(page);
  let available = false;
  await page.route('**/api/users/me', route => available ? route.fallback() : route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Perfil temporariamente indisponível.' }) }));
  await page.goto('/perfil');
  await expect(page.getByRole('alert')).toHaveText('Perfil temporariamente indisponível.');
  await expect(page.getByRole('button', { name: 'Editar Perfil', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salvar alterações', exact: true })).toHaveCount(0);
  available = true;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar Perfil', exact: true })).toBeVisible();
});

test('event details display real transmission, activities and speaker biographies', async ({ page }, info) => {
  test.setTimeout(90000);
  const event = { ...participantEvent, modality: 'Híbrido', streamUrl: 'https://example.test/transmissao', speakers: [{ ...participantEvent.speakers[0], biography: 'Pesquisadora em sistemas distribuídos e computação científica.', email: 'privado@example.test' }] };
  const state = await participantFixture(page, { events: [event] });
  await page.goto('/eventos/' + event.id);
  await expect(page.getByRole('heading', { name: event.title, exact: true })).toBeVisible();
  for (const name of ['Sobre o evento', 'Modalidade e Transmissão', 'Atividades Vinculadas', 'Professores e Palestrantes Convidados']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: /example.test\/transmissao/ })).toHaveAttribute('href', event.streamUrl);
  await expect(page.locator('.participant-details__activity')).toHaveCount(2);
  await expect(page.locator('.participant-details__activity').first()).toContainText('Duração: 4h');
  await expect(page.locator('.participant-details__speaker')).toContainText(event.speakers[0].biography);
  await expect(page.locator('.participant-details__speaker')).not.toContainText('privado@example.test');
  await expect(page.locator('.participant-footer')).toContainText('Plataforma Acadêmica de Eventos e Pesquisa');
  await expect(page.getByRole('link', { name: 'Inscreva-se', exact: true })).toHaveAttribute('href', '/eventos/' + event.id + '/inscricao');
  await expect(page.getByRole('link', { name: 'Inscrever-se na atividade', exact: true }).first()).toHaveAttribute('href', '/atividades/' + event.id + '/' + paidActivity.id + '/inscricao');
  await captureParticipant(page, info, 'participant-event-details');
  await page.goto('/eventos/' + event.id + '#atividades');
  await expect.poll(() => page.locator('#atividades').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBeLessThan(100);
  expect(state.unexpected).toEqual([]);
});

test('all shared logos use genuine alpha transparency and keep their proportions', async ({ page }) => {
  await participantFixture(page);
  await page.goto('/eventos');
  await expect(page.locator('.brand-logo')).toHaveCount(2);
  const logos = await page.locator('.brand-logo').evaluateAll(async images => {
    return Promise.all(images.map(async node => {
      const image = node as HTMLImageElement;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0, visible = 0;
      for (let index = 3; index < pixels.length; index += 32) {
        if (pixels[index] === 0) transparent++;
        if (pixels[index] > 200) visible++;
      }
      const bounds = image.getBoundingClientRect();
      return { src: image.getAttribute('src'), transparent, visible, ratio: bounds.width / bounds.height, intrinsic: image.naturalWidth / image.naturalHeight };
    }));
  });
  for (const logo of logos) {
    expect(logo.src).toBe('/figma/eventhub-logo-transparent.png');
    expect(logo.transparent).toBeGreaterThan(logo.visible);
    expect(logo.visible).toBeGreaterThan(0);
    expect(Math.abs(logo.ratio - logo.intrinsic)).toBeLessThan(0.01);
  }
});

test('registration tabs distinguish ended confirmed activities from pending, waitlisted and cancelled records', async ({ page }, info) => {
  test.setTimeout(90000);
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const earlier = new Date(Date.now() - 100800000).toISOString();
  const completed = registrationFor({ ...paidActivity, title: 'Workshop com programação encerrada', startsAt: earlier, endsAt: yesterday }, 'CONFIRMED', 'completed');
  const waiting = registrationFor({ ...freeActivity, startsAt: earlier, endsAt: yesterday }, 'WAITLISTED', 'waiting');
  const pending = registrationFor({ ...paidActivity, startsAt: earlier, endsAt: yesterday }, 'PENDING_PAYMENT', 'pending');
  const cancelled = registrationFor({ ...paidActivity, startsAt: earlier, endsAt: yesterday }, 'CANCELLED', 'closed');
  const state = await participantFixture(page, { registrations: [completed, waiting, pending, cancelled] });
  await page.goto('/minhas-inscricoes');
  await expect(page.getByRole('tab', { name: /Inscrições Ativas/ })).toContainText('2');
  await expect(page.getByRole('tab', { name: /Cursos Concluídos/ })).toContainText('1');
  await expect(page.getByRole('tab', { name: /Encerradas/ })).toContainText('1');
  await expect(page.locator('.my-registration-card')).toHaveCount(2);
  await page.getByRole('tab', { name: /Inscrições Ativas/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Cursos Concluídos/ })).toBeFocused();
  await expect(page.getByRole('tab', { name: /Cursos Concluídos/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.my-registration-card')).toHaveCount(1);
  await expect(page.locator('.my-registration-activity')).toContainText(completed.activity.title);
  await expect(page.getByRole('button', { name: 'Baixar Certificado (PDF)', exact: true })).toBeEnabled();
  await expect(page.getByText('Certificados exigem inscrição confirmada, presença registrada e atividade concluída.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver Programação', exact: true })).toHaveAttribute('href', '/eventos/' + completed.eventId + '#atividades');
  await expect(page.getByRole('button', { name: 'Cancelar inscrição', exact: true })).toHaveCount(0);
  await captureParticipant(page, info, 'my-registrations-completed');
  expect(state.posts).toHaveLength(0);
  expect(state.unexpected).toEqual([]);
});

test('a confirmed activity moves to the history at its end without a reload', async ({ page }) => {
  const time = Date.now();
  const ending = registrationFor({ ...paidActivity, startsAt: new Date(time - 3600000).toISOString(), endsAt: new Date(time + 60000).toISOString() }, 'CONFIRMED');
  await participantFixture(page, { registrations: [ending] });
  await page.clock.install({ time });
  await page.goto('/minhas-inscricoes');
  await expect(page.getByRole('link', { name: 'Ver ingresso', exact: true })).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(page.locator('.my-registration-card')).toHaveCount(0);
  await page.getByRole('tab', { name: /Cursos Concluídos/ }).click();
  await expect(page.locator('.my-registration-card')).toHaveCount(1);
  await expect(page.locator('.my-registration-card')).toContainText('Atividade encerrada');
});
