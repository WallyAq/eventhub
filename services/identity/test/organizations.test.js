import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createOrganizationService } from '../src/organizations/service.js';
import { createOrganizationRepository } from '../src/organizations/repository.js';

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

test('only OWNER removes organizers, protects the owner, and permits re-adding a removed member', async () => {
  const id = randomUUID(), owner = randomUUID(), member = randomUUID(), outsider = randomUUID();
  let included = true, removals = 0;
  const service = createOrganizationService({
    async findForUser(orgId, userId) {
      if (orgId !== id || userId === outsider || userId === member && !included) return;
      return { id, membershipRole: userId === owner ? 'OWNER' : 'ORGANIZER' };
    },
    async removeMember(_id, _actorId, target) {
      removals++;
      if (target === owner) return 'OWNER_PROTECTED';
      if (!included || target !== member) return 'NOT_FOUND';
      included = false; return 'REMOVED';
    },
    async addMember() { included = true; return { id: member, role: 'ORGANIZER' }; },
  });
  await assert.rejects(service.removeMember(id, member, owner), { status: 403 });
  await assert.rejects(service.removeMember(id, outsider, member), { status: 404 });
  assert.equal(removals, 0);
  await assert.rejects(service.removeMember(id, owner, owner), { status: 409, code: 'owner_protected' });
  await assert.rejects(service.removeMember(id, owner, 'invalid'), { status: 400 });
  await service.removeMember(id, owner, member);
  await assert.rejects(service.get(id, member), { status: 404 });
  await assert.rejects(service.removeMember(id, owner, member), { status: 404 });
  await service.addMember(id, owner, { email: 'member@example.test' });
  assert.equal((await service.get(id, member)).membershipRole, 'ORGANIZER');
});

test('membership deletion rechecks OWNER transactionally and never deletes an owner', async () => {
  for (const [actorRole, targetRole, expected] of [['ORGANIZER','ORGANIZER','FORBIDDEN'], ['OWNER','OWNER','OWNER_PROTECTED'], ['OWNER',undefined,'NOT_FOUND'], ['OWNER','ORGANIZER','REMOVED']]) {
    const statements = [];
    const repository = createOrganizationRepository({ async connect() { return {
      release() {}, async query(sql) {
        statements.push(sql);
        if (sql.startsWith('SELECT role')) return { rows: sql.endsWith('FOR UPDATE') ? (targetRole ? [{ role: targetRole }] : []) : [{ role: actorRole }] };
        return { rows: [] };
      },
    }; } });
    assert.equal(await repository.removeMember(randomUUID(), randomUUID(), randomUUID()), expected);
    assert.equal(statements.some(sql => sql.startsWith('DELETE FROM organization_members')), expected === 'REMOVED');
    assert.equal(statements.at(-1), expected === 'REMOVED' ? 'COMMIT' : 'ROLLBACK');
  }
});

