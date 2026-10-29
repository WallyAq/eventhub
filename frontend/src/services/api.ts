import type { PlatformStatus } from '../types/status';

export async function getPlatformStatus(): Promise<PlatformStatus> {
  const response = await fetch('/api/status', { signal: AbortSignal.timeout(6000) });
  if (response.status !== 200 && response.status !== 503) throw new Error('Falha na consulta');
  return response.json() as Promise<PlatformStatus>;
}

