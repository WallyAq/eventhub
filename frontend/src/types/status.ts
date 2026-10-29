export type ServiceStatus = { name: string; status: 'ready' | 'unavailable' };
export type PlatformStatus = { status: 'ready' | 'degraded'; services: ServiceStatus[] };

