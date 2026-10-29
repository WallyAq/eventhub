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

export function createUserService(repository, tokens) {
  // Mesmo custo de verificação para e-mails inexistentes.
  let dummyHash;
  return {
    async register(body) {
      fields(body, ['name', 'email', 'password']);
      const name = nameValue(body.name);
      const { email, password } = credentials(body);
      const passwordHash = await hashPassword(password);
      try { return await repository.create({ name, email, passwordHash }); }
      catch (error) {
        if (error.code === '23505') throw new UserError(409, 'email_in_use', 'Este e-mail já está cadastrado.');
        throw error;
      }
    },
    async login(body) {
      fields(body, ['email', 'password']);
      const { email, password } = credentials(body);
      const found = await repository.findCredentials(email);
      dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
      const valid = await verifyPassword(password, found?.passwordHash || await dummyHash);
      if (!found || !valid) throw new UserError(401, 'invalid_credentials', 'E-mail ou senha incorretos.');
      const { passwordHash, ...user } = found;
      return { accessToken: await tokens.issue(user), tokenType: 'Bearer', expiresIn: tokens.expiresIn, user };
    },
    async profile(id) {
      const user = await repository.findById(id);
      if (!user) throw new UserError(401, 'invalid_token', 'Sessão inválida.');
      return user;
    },
    async updateProfile(id, body) {
      fields(body, ['name']);
      const user = await repository.updateName(id, nameValue(body.name));
      if (!user) throw new UserError(401, 'invalid_token', 'Sessão inválida.');
      return user;
    },
  };
}

