import { test, expect } from '@playwright/test';
import { participant, participantFixture } from './participant-fixture';

test('CPF and phone masks support typing, pasting, mid-field deletion and raw signup values', async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await page.route('**/api/auth/register', route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ json: { user: participant } });
  });
  await page.goto('/participante/cadastro');
  const cpf = page.getByLabel('CPF', { exact: true });
  const phone = page.getByLabel('Telefone', { exact: true });
  await cpf.pressSequentially('52998224725');
  await expect(cpf).toHaveValue('529.982.247-25');
  // Backspace at punctuation removes the preceding digit without trapping the caret.
  await cpf.evaluate((node: HTMLInputElement) => node.setSelectionRange(4, 4));
  await cpf.press('Backspace');
  await expect(cpf).toHaveValue('529.822.472-5');
  await cpf.pressSequentially('9');
  await expect(cpf).toHaveValue('529.982.247-25');
  await cpf.evaluate((node: HTMLInputElement) => node.setSelectionRange(3, 3));
  await cpf.press('Delete');
  await expect(cpf).toHaveValue('529.822.472-5');
  await cpf.fill('529.982.247-25');
  // A virtual keyboard may delete the dot without dispatching keydown.
  await cpf.evaluate((node: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, '529982.247-25');
    node.setSelectionRange(3, 3);
    node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  });
  await expect(cpf).toHaveValue('529.822.472-5');
  await cpf.fill('529.982.247-25');
  await cpf.press('End');
  await cpf.pressSequentially('abc');
  await expect(cpf).toHaveValue('529.982.247-25');
  await phone.fill('8532345678');
  await expect(phone).toHaveValue('(85) 3234-5678');
  await phone.fill('');
  await phone.pressSequentially('85912345678');
  await expect(phone).toHaveValue('(85) 91234-5678');
  await phone.fill('+55 (85) 91234-5678');
  await expect(phone).toHaveValue('+55 (85) 91234-5678');
  await phone.fill('(85) 91234-5678');
  await page.getByLabel('Nome completo', { exact: true }).fill('Pessoa de Teste');
  await page.getByLabel('E-mail', { exact: true }).fill('masked@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('TesteSenha123');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('TesteSenha123');
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page).toHaveURL(/\/participante\/login$/);
  expect(payload).toMatchObject({ cpf: '52998224725', phone: '85912345678' });
});

test('institution signup formats CNPJ and preserves alphanumeric identifiers in the request', async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await page.route('**/api/auth/register', route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ json: { user: participant } });
  });
  await page.goto('/organizacao/cadastro');
  const cnpj = page.getByLabel(/CNPJ da Instituição/);
  await cnpj.pressSequentially('12345678000190');
  await expect(cnpj).toHaveValue('12.345.678/0001-90');
  await cnpj.fill('12abc34501de35');
  await expect(cnpj).toHaveValue('12.ABC.345/01DE-35');
  await page.getByLabel('Razão Social', { exact: true }).fill('Instituição de Teste');
  await page.getByLabel('Nome Fantasia ou Sigla', { exact: true }).fill('Teste');
  await page.getByLabel('Telefone Institucional', { exact: true }).fill('8532345678');
  await expect(page.getByLabel('Telefone Institucional', { exact: true })).toHaveValue('(85) 3234-5678');
  await page.getByLabel('E-mail', { exact: true }).fill('masked-org@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('TesteSenha123');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('TesteSenha123');
  await page.getByLabel(/Declaro possuir/).check();
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole('button', { name: 'Cadastrar Instituição Organizadora' }).click();
  await expect(page).toHaveURL(/\/organizacao\/login$/);
  expect(payload).toMatchObject({ phone: '8532345678', organization: { cnpj: '12ABC34501DE35', phone: '8532345678' } });
});

test('organization profile loads masked fields and saves raw edited values', async ({ page }) => {
  await participantFixture(page);
  let organization = { id: 'mask-organization', name: 'Instituição QA', legalName: 'Instituição QA', cnpj: '12345678000190', phone: '8532345678', email: 'org@example.test', description: '', membershipRole: 'OWNER', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  let saved: unknown;
  await page.route('**/api/organizations', route => route.fulfill({ json: { organizations: [organization] } }));
  await page.route('**/api/organizations/mask-organization', route => {
    saved = route.request().postDataJSON();
    organization = { ...organization, ...saved as object };
    return route.fulfill({ json: { organization } });
  });
  await page.goto('/organizacao/perfil');
  await expect(page.locator('.organization-profile__readout')).toContainText('12.345.678/0001-90');
  await page.getByRole('button', { name: 'Editar Perfil', exact: true }).click();
  await expect(page.getByLabel('CNPJ', { exact: true })).toHaveValue('12.345.678/0001-90');
  await expect(page.getByLabel('Telefone', { exact: true })).toHaveValue('(85) 3234-5678');
  await page.getByLabel('CNPJ', { exact: true }).fill('12345678000270');
  await page.getByLabel('Telefone', { exact: true }).fill('85912345678');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Dados da instituição atualizados.');
  expect(saved).toMatchObject({ cnpj: '12345678000270', phone: '85912345678' });
});
