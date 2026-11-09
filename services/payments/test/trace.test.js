import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { traceHeaders, withTrace } from '../src/trace.js';

test('concurrent payment reconciliations preserve their durable correlation across awaits', async () => {
  await Promise.all(['registration-A', 'registration-B'].map(id => withTrace(id, 'worker-' + id, async () => {
    await setTimeout(10);
    assert.deepEqual(traceHeaders(), { 'x-request-id': 'worker-' + id, 'x-correlation-id': id });
  })));
  assert.deepEqual(traceHeaders(), {});
});
