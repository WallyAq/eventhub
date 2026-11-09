import { randomUUID } from 'node:crypto';
import { traces } from '../trace.js';

export const requestLogging = (req, res, next) => {
    const id = req.get('x-request-id');
    req.requestId = id && /^[a-zA-Z0-9-]{1,64}$/.test(id) ? id : randomUUID();
    const correlation = req.get('x-correlation-id');
    req.correlationId = correlation && /^[a-zA-Z0-9-]{1,64}$/.test(correlation) ? correlation : req.requestId;
    res.set('x-request-id', req.requestId); res.set('x-correlation-id', req.correlationId);
    const start = Date.now();
    res.on('finish', () => console.log(JSON.stringify({
      service: 'identity', requestId: req.requestId, correlationId: req.correlationId, method: req.method,
      path: req.path, status: res.statusCode, durationMs: Date.now() - start,
    })));
    traces.run({ requestId: req.requestId, correlationId: req.correlationId }, next);
  };

