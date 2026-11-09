import { randomUUID } from 'node:crypto';

export const requestLogging = (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.requestId = incoming && /^[a-zA-Z0-9-]{1,64}$/.test(incoming) ? incoming : randomUUID();
    const correlation = req.get('x-correlation-id');
    req.correlationId = correlation && /^[a-zA-Z0-9-]{1,64}$/.test(correlation) ? correlation : req.requestId;
    res.set('x-request-id', req.requestId); res.set('x-correlation-id', req.correlationId);
    const start = Date.now();
    res.on('finish', () => console.log(JSON.stringify({
      service: 'gateway', requestId: req.requestId, correlationId: req.correlationId, method: req.method,
      path: req.path, status: res.statusCode, durationMs: Date.now() - start,
    })));
    next();
  };

