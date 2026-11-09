import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const traces = new AsyncLocalStorage();
export const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);
export function traceHeaders() {
  const trace = traces.getStore();
  return trace ? { 'x-request-id': trace.requestId, 'x-correlation-id': trace.correlationId } : {};
}
export function withTrace(correlationId, requestId, work) {
  const current = traces.getStore();
  if (current) { if (validId(correlationId)) current.correlationId = correlationId; return work(); }
  const id = validId(requestId) ? requestId : randomUUID();
  return traces.run({ requestId: id, correlationId: validId(correlationId) ? correlationId : id }, work);
}
export function logEvent(event, fields = {}) {
  console.log(JSON.stringify({ service: 'payments', ...traces.getStore(), event, ...fields }));
}
