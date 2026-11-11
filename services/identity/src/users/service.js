import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from '../security/passwords.js';

export class UserError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)))
    throw new UserError(400, 'invalid_input', 'Campos inválidos.');
}
function nameValue(value) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 120)
    throw new UserError(400, 'invalid_input', 'Informe um nome entre 2 e 120 caracteres.');
  return value.trim();
}
function credentials(body) {
  if (typeof body.email !== 'string' || body.email.trim().length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
      || typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128)
    throw new UserError(400, 'invalid_input', 'Informe e-mail válido e senha entre 8 e 128 caracteres.');
  return { email: body.email.trim().toLowerCase(), password: body.password };
}

function details(body) {
  const values = {};
  for (const [key, length] of [['cpf', 11], ['phone', 15]]) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string' || body[key].length > 30) throw new UserError(400, 'invalid_input', 'Dados de contato inválidos.');
    const value = body[key].replace(/\D/g, '');
    if (value && (key === 'cpf' ? value.length !== length : value.length < 10 || value.length > length))
      throw new UserError(400, 'invalid_input', key === 'cpf' ? 'Informe um CPF com 11 dígitos.' : 'Informe um telefone válido.');
    values[key] = value || null;
  }
  return values;
}

function institution(body, email) {
  fields(body, ['cnpj', 'legalName', 'tradeName', 'entityType', 'phone']);
  const cnpj = typeof body.cnpj === 'string' ? body.cnpj.replace(/[^a-z0-9]/gi, '').toUpperCase() : '';
  if (!/^[A-Z0-9]{14}$/.test(cnpj)) throw new UserError(400, 'invalid_input', 'Informe um CNPJ com 14 caracteres.');
  if (typeof body.entityType !== 'string' || !body.entityType.trim() || body.entityType.length > 80)
    throw new UserError(400, 'invalid_input', 'Informe o tipo da instituição.');
  const phone = details({ phone: body.phone }).phone;
  if (!phone) throw new UserError(400, 'invalid_input', 'Informe o telefone institucional.');
  return { cnpj, legalName: nameValue(body.legalName), name: nameValue(body.tradeName), entityType: body.entityType.trim(), phone, email };
}

export function createUserService(repository, tokens) {
  // Mesmo custo de verificação para e-mails inexistentes.
  let dummyHash;
  return {
    async register(body) {
      fields(body, ['name', 'email', 'password', 'cpf', 'phone', 'marketingOptIn', 'termsAccepted', 'organization']);
      const name = nameValue(body.name);
      const { email, password } = credentials(body);
      if (body.marketingOptIn !== undefined && typeof body.marketingOptIn !== 'boolean') throw new UserError(400, 'invalid_input', 'Preferência inválida.');
      if (body.termsAccepted !== undefined && body.termsAccepted !== true) throw new UserError(400, 'invalid_input', 'Confirme os termos de uso.');
      const extra = details(body);
      const organization = body.organization === undefined ? undefined : institution(body.organization, email);
      const passwordHash = await hashPassword(password);
      try { return await repository.create({ name, email, passwordHash, ...extra, marketingOptIn: body.marketingOptIn === true, termsAccepted: body.termsAccepted === true, organization }); }
      catch (error) {
        if (error.code === '23505' && error.constraint === 'organizations_cnpj_key') throw new UserError(409, 'organization_in_use', 'Este CNPJ já está cadastrado.');
        if (error.code === '23505') throw new UserError(409, 'email_in_use', 'Este e-mail já está cadastrado.');
        throw error;
      }
    },
    async login(body) {
      fields(body, ['email', 'password', 'area']);
      if (body.area !== undefined && !['participant', 'organization'].includes(body.area))
        throw new UserError(400, 'invalid_input', 'Área de acesso inválida.');
      const { email, password } = credentials(body);
      const found = await repository.findCredentials(email);
      // Allocate the deliberately expensive dummy hash only for unknown accounts.
      // Creating it on every first successful login needlessly doubles scrypt memory.
      if (!found) dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
      const valid = await verifyPassword(password, found?.passwordHash || await dummyHash);
      if (!found || !valid) throw new UserError(401, 'invalid_credentials', 'E-mail ou senha incorretos.');
      if (body.area !== undefined && found.role !== (body.area === 'organization' ? 'ORGANIZER' : 'PARTICIPANT'))
        throw new UserError(403, 'account_area_mismatch', found.role === 'PARTICIPANT'
          ? 'Esta conta é de participante. Acesse a área do participante.'
          : 'Esta conta é de organizador. Acesse a área do organizador.');
      const { passwordHash, credentialsVersion, ...user } = found;
      return { accessToken: await tokens.issue({ ...user, credentialsVersion }), tokenType: 'Bearer', expiresIn: tokens.expiresIn, user };
    },
    async profile(id) {
      const user = await repository.findById(id);
      if (!user) throw new UserError(401, 'invalid_token', 'Sessão inválida.');
      return user;
    },
    async updateProfile(id, body) {
      fields(body, ['name', 'cpf', 'phone']);
      const user = await repository.updateName(id, nameValue(body.name), details(body));
      if (!user) throw new UserError(401, 'invalid_token', 'Sessão inválida.');
      return user;
    },
    async changePassword(id, body) {
      fields(body, ['currentPassword', 'newPassword']);
      if (typeof body.currentPassword !== 'string' || body.currentPassword.length < 8 || body.currentPassword.length > 128
          || typeof body.newPassword !== 'string' || body.newPassword.length < 8 || body.newPassword.length > 128)
        throw new UserError(400, 'invalid_input', 'As senhas devem ter entre 8 e 128 caracteres.');
      const profile = await repository.findById(id);
      if (!profile) throw new UserError(401, 'invalid_token', 'Sessão inválida.');
      const user = await repository.findCredentials(profile.email);
      if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) throw new UserError(400, 'invalid_password', 'Senha atual incorreta.');
      if (body.currentPassword === body.newPassword) throw new UserError(400, 'invalid_input', 'Escolha uma senha diferente da atual.');
      if (!(await repository.changePassword(id, user.passwordHash, await hashPassword(body.newPassword))))
        throw new UserError(409, 'password_changed', 'A senha foi alterada em outra operação. Entre novamente.');
    },
  };
}

