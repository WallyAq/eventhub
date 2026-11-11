import { UserError } from '../users/service.js';

function input(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)))
    throw new UserError(400, 'invalid_input', 'Campos inválidos.');
}
function organizationId(id) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
    throw new UserError(400, 'invalid_input', 'Identificador de organização inválido.');
}
function data(body, partial = false) {
  input(body, partial ? ['name', 'description', 'cnpj', 'legalName', 'entityType', 'phone', 'email'] : ['name', 'description']);
  if (partial && !Object.keys(body).length) throw new UserError(400, 'invalid_input', 'Informe os dados a alterar.');
  const result = {};
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 120)
      throw new UserError(400, 'invalid_input', 'Informe um nome entre 2 e 120 caracteres.');
    result.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > 2000)
      throw new UserError(400, 'invalid_input', 'Descrição deve ter até 2000 caracteres.');
    result.description = body.description.trim();
  } else if (!partial) result.description = '';
  for (const [key, max] of [['legalName',120],['entityType',80],['email',254]]) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string' || body[key].trim().length > max) throw new UserError(400,'invalid_input','Dados institucionais inválidos.');
    result[key] = body[key].trim();
  }
  if (result.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new UserError(400,'invalid_input','E-mail inválido.');
    result.email = result.email.toLowerCase();
  }
  if (body.cnpj !== undefined) {
    if (typeof body.cnpj !== 'string' || body.cnpj.length > 24) throw new UserError(400,'invalid_input','CNPJ inválido.');
    result.cnpj = body.cnpj.replace(/[^a-z0-9]/gi,'').toUpperCase();
    if (!/^[A-Z0-9]{14}$/.test(result.cnpj)) throw new UserError(400,'invalid_input','CNPJ deve ter 14 caracteres.');
  }
  if (body.phone !== undefined) {
    if (typeof body.phone !== 'string' || body.phone.length > 30) throw new UserError(400,'invalid_input','Telefone inválido.');
    result.phone = body.phone.replace(/\D/g,'');
    if (result.phone && (result.phone.length < 10 || result.phone.length > 15)) throw new UserError(400,'invalid_input','Telefone inválido.');
  }
  return result;
}

export function createOrganizationService(repository) {
  async function access(id, userId, owner = false) {
    organizationId(id);
    const organization = await repository.findForUser(id, userId);
    if (!organization) throw new UserError(404, 'organization_not_found', 'Organização não encontrada.');
    if (owner && organization.membershipRole !== 'OWNER') throw new UserError(403, 'forbidden', 'Apenas o responsável pode realizar esta operação.');
    return organization;
  }
  return {
    list: userId => repository.list(userId),
    create: () => { throw new UserError(409, 'institution_fixed', 'A instituição é definida no cadastro da conta de organizador e não pode ser alterada por esta operação.'); },
    get: (id, userId) => access(id, userId),
    async update(id, userId, body) {
      const values = data(body, true);
      await access(id, userId, true);
      let organization;
      try { organization = await repository.update(id, userId, values); }
      catch (error) { if (error.code === '23505') throw new UserError(409,'organization_in_use','Este CNPJ já está cadastrado.'); throw error; }
      if (!organization) throw new UserError(403, 'forbidden', 'Acesso não autorizado.');
      return organization;
    },
    async members(id, userId) { await access(id, userId); return repository.members(id, userId); },
    async addMember(id, userId, body) {
      input(body, ['email']);
      if (typeof body.email !== 'string' || body.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))
        throw new UserError(400, 'invalid_input', 'Informe um e-mail válido.');
      await access(id, userId, true);
      try {
        const member = await repository.addMember(id, userId, body.email.trim().toLowerCase());
        if (!member) throw new UserError(404, 'user_not_found', 'Usuário não encontrado. Cadastre a conta antes de adicioná-la.');
        return member;
      } catch (error) {
        if (error.code === '23505') throw new UserError(409, 'institution_fixed', 'O organizador já possui um vínculo institucional.');
        if (error.code === 'PROFILE_REQUIRED') throw new UserError(409, 'organizer_required', 'A conta deve possuir exclusivamente o perfil de organizador. Esta operação não converte participantes.');
        if (error.code === 'INSTITUTION_FIXED') throw new UserError(409, 'institution_fixed', 'O organizador já está vinculado a outra instituição.');
        throw error;
      }
    },
    async removeMember(id, userId, memberId) {
      await access(id, userId, true);
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(memberId))
        throw new UserError(400, 'invalid_input', 'Identificador de membro inválido.');
      throw new UserError(409, 'institution_fixed', 'Remover o único vínculo deixaria o organizador sem instituição. Transferências exigem um processo administrativo definido.');
    },
  };
}
