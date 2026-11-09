import { randomUUID } from 'node:crypto';
import { traces, validId } from '../trace.js';

export const requestLogging = (req, res, next) => {
    const id = req.get('x-request-id');
    req.requestId = id && /^[a-zA-Z0-9-]{1,64}$/.test(id) ? id : randomUUID();
    const current = { requestId: req.requestId, correlationId: validId(req.get('x-correlation-id')) ? req.get('x-correlation-id') : req.requestId };
    res.set('x-request-id', req.requestId);
    const start = Date.now();
    res.on('finish', () => console.log(JSON.stringify({
      service: 'payments', requestId: req.requestId, correlationId: current.correlationId, method: req.method,
      path: req.path, status: res.statusCode, durationMs: Date.now() - start,
    })));
    res.set('x-correlation-id', current.correlationId);
    traces.run(current, next);
  };

