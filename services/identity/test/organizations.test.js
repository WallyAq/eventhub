import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createOrganizationService } from '../src/organizations/service.js';

test('organization access is based on membership, with owner-only management', async () => {
  const id = randomUUID(), owner = randomUUID(), member = randomUUID(), outsider = randomUUID();
  const repository = {
    async list(userId) { return userId === outsider ? [] : [{ id }]; },
    async findForUser(orgId, userId) {
      if (orgId !== id || userId === outsider) return;
      return { id, name: 'UECE', membershipRole: userId === owner ? 'OWNER' : 'ORGANIZER' };
    },
    async update(_id, _userId, values) { return { id, ...values, membershipRole: 'OWNER' }; },
    async members() { return [{ id: owner, role: 'OWNER' }, { id: member, role: 'ORGANIZER' }]; },
    async addMember(_id, _userId, email) {
      if (email === 'existing@example.test') throw Object.assign(new Error('duplicate'), { code: '23505' });
      if (email === 'missing@example.test') return;
      return { id: member, role: 'ORGANIZER' };
    },
    async create(userId, values) { return { id, ...values, membershipRole: 'OWNER' }; },
  };
  const service = createOrganizationService(repository);
  assert.deepEqual(await service.list(outsider), []);
  assert.equal((await service.get(id, member)).membershipRole, 'ORGANIZER');
  await assert.rejects(service.get(id, outsider), { status: 404 });
  await assert.rejects(service.get('invalid', owner), { status: 400 });
  await assert.rejects(service.update(id, member, { name: 'Changed' }), { status: 403 });
  await assert.rejects(service.members(id, outsider), { status: 404 });
  await assert.rejects(service.addMember(id, member, { email: 'new@example.test' }), { status: 403 });
  await assert.rejects(service.addMember(id, outsider, { email: 'new@example.test' }), { status: 404 });
  await assert.rejects(service.addMember(id, owner, { email: 'new@example.test', role: 'OWNER' }), { status: 400 });
  await assert.rejects(service.addMember(id, owner, { email: 'missing@example.test' }), { status: 404 });
  await assert.rejects(service.addMember(id, owner, { email: 'existing@example.test' }), { status: 409 });
  assert.equal((await service.addMember(id, owner, { email: 'new@example.test' })).role, 'ORGANIZER');
  assert.equal((await service.update(id, owner, { name: 'Changed' })).name, 'Changed');
  assert.throws(() => service.create(owner, { name: 'X' }), { status: 400 });
  assert.throws(() => service.create(owner, { name: 'UECE', ownerId: outsider }), { status: 400 });
  await assert.rejects(service.update(id, owner, {}), { status: 400 });
  assert.equal((await service.create(owner, { name: ' UECE ', description: ' Research ' })).description, 'Research');
});

