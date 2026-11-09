import { AsyncLocalStorage } from 'node:async_hooks';

export const traces = new AsyncLocalStorage();
export const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);
