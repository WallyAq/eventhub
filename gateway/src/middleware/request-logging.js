import { randomUUID } from 'node:crypto';

export const requestLogging = (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.requestId = incoming && /^[a-zA-Z0-9-]{1,64}$/.test(incoming) ? incoming : randomUUID();
    res.set('x-request-id', req.requestId);
    const start = Date.now();
    res.on('finish', () => console.log(JSON.stringify({
      service: 'gateway', requestId: req.requestId, method: req.method,
      path: req.path, status: res.statusCode, durationMs: Date.now() - start,
    })));
    next();
  };

