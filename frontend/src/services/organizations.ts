import { identityRequest } from './identity';
import type { Organization, OrganizationMember } from '../types/organizations';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta inválida.');
  return value as Record<string, unknown>;
}
function organization(value: unknown): Organization {
  const item = object(value);
  for (const key of ['cnpj','legalName','entityType','phone','email']) if (item[key] != null && typeof item[key] !== 'string') throw new Error('Resposta inválida.');
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.description !== 'string'
      || typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string'
      || !['OWNER', 'ORGANIZER'].includes(String(item.membershipRole))) throw new Error('Resposta inválida.');
  return item as Organization;
}
export async function listOrganizations(token: string, signal?: AbortSignal) {
  const data = await identityRequest('/organizations', 'GET', undefined, token, signal);
  if (!Array.isArray(data.organizations)) throw new Error('Resposta inválida.');
  return data.organizations.map(organization);
}
export async function createOrganization(token: string, name: string, description: string) {
  return organization((await identityRequest('/organizations', 'POST', { name, description }, token)).organization);
}
export async function getOrganization(token: string, id: string, signal?: AbortSignal) {
  return organization((await identityRequest('/organizations/' + id, 'GET', undefined, token, signal)).organization);
}
export async function updateOrganization(token: string, id: string, name: string, description: string, details: { cnpj?: string; legalName?: string; phone?: string; email?: string } = {}) {
  return organization((await identityRequest('/organizations/' + id, 'PATCH', { name, description, ...details }, token)).organization);
}
export async function listMembers(token: string, id: string, signal?: AbortSignal): Promise<OrganizationMember[]> {
  const data = await identityRequest('/organizations/' + id + '/members', 'GET', undefined, token, signal);
  if (!Array.isArray(data.members)) throw new Error('Resposta inválida.');
  return data.members.map(value => {
    const item = object(value);
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.email !== 'string'
        || typeof item.createdAt !== 'string' || !['OWNER', 'ORGANIZER'].includes(String(item.role))) throw new Error('Resposta inválida.');
    return item as OrganizationMember;
  });
}
export async function addMember(token: string, id: string, email: string) {
  await identityRequest('/organizations/' + id + '/members', 'POST', { email }, token);
}

