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
  for (const key of ['cpf','phone']) if (user[key] != null && typeof user[key] !== 'string') throw new Error('Resposta inválida do serviço.');
  if (typeof user.id !== 'string' || typeof user.name !== 'string' || typeof user.email !== 'string'
      || !['PARTICIPANT', 'ORGANIZER'].includes(String(user.role))
      || (user.role === 'PARTICIPANT' ? user.organizationId !== null : typeof user.organizationId !== 'string' || !user.organizationId)
      || typeof user.createdAt !== 'string' || typeof user.updatedAt !== 'string')
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
  if (!response.ok) throw new ApiError(response.status, typeof data.message === 'string' ? data.message : typeof data.detail === 'string' ? data.detail : Array.isArray(data.detail) ? 'Verifique os campos, datas e horários informados.' : 'Não foi possível concluir a operação.');
  return data;
}
export async function registerParticipant(name: string, email: string, password: string, details: Record<string, unknown> = {}) {
  return parseUser((await request('/auth/register', 'POST', { name, email, password, ...details })).user);
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
export async function updateProfile(token: string, name: string, details: { cpf?: string; phone?: string } = {}) {
  return parseUser((await request('/users/me', 'PATCH', { name, ...details }, token)).user);
}
export async function changePassword(token: string, currentPassword: string, newPassword: string) {
  await request('/users/me/password', 'POST', { currentPassword, newPassword }, token);
}
export async function logoutSession(token: string) {
  const response = await fetch('/api/auth/logout', {
    method: 'POST', headers: { authorization: 'Bearer ' + token },
    cache: 'no-store', keepalive: true, signal: AbortSignal.timeout(8000),
  });
  if (response.status !== 204 && response.status !== 401)
    throw new ApiError(response.status, 'Não foi possível revogar a sessão no servidor.');
}
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'A conexão demorou mais que o esperado. Tente novamente.';
  if (error instanceof Error && error.name === 'AbortError') return 'A conexão foi interrompida. Tente novamente.';
  return error instanceof Error && !(error instanceof TypeError) ? error.message : 'Não foi possível conectar ao serviço. Tente novamente.';
}
export { request as identityRequest };

