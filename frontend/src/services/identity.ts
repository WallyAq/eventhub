import type { LoginResult, User } from '../types/auth';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta inválida do serviço.');
  return value as Record<string, unknown>;
}
function parseUser(value: unknown): User {
  const user = record(value);
  if (typeof user.id !== 'string' || typeof user.name !== 'string' || typeof user.email !== 'string'
      || user.role !== 'PARTICIPANT' || typeof user.createdAt !== 'string' || typeof user.updatedAt !== 'string')
    throw new Error('Resposta inválida do serviço.');
  return user as User;
}
async function request(path: string, method: string, body?: unknown, token?: string, signal?: AbortSignal) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const response = await fetch('/api' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  const data = record(await response.json());
  if (!response.ok) throw new ApiError(response.status, typeof data.message === 'string' ? data.message : 'Não foi possível concluir a operação.');
  return data;
}
export async function registerParticipant(name: string, email: string, password: string) {
  return parseUser((await request('/auth/register', 'POST', { name, email, password })).user);
}
export async function login(email: string, password: string): Promise<LoginResult> {
  const data = await request('/auth/login', 'POST', { email, password });
  if (typeof data.accessToken !== 'string' || data.tokenType !== 'Bearer'
      || typeof data.expiresIn !== 'number' || data.expiresIn <= 0 || !Number.isFinite(data.expiresIn))
    throw new Error('Resposta inválida do serviço.');
  return { accessToken: data.accessToken, tokenType: 'Bearer', expiresIn: data.expiresIn, user: parseUser(data.user) };
}
export async function getProfile(token: string, signal?: AbortSignal) {
  return parseUser((await request('/users/me', 'GET', undefined, token, signal)).user);
}
export async function updateProfile(token: string, name: string) {
  return parseUser((await request('/users/me', 'PATCH', { name }, token)).user);
}
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Não foi possível conectar ao serviço. Tente novamente.';
}
export { request as identityRequest };

