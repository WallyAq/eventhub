import { randomUUID } from 'node:crypto';

export const requestLogging = (req, res, next) => {
    const id = req.get('x-request-id');
    req.requestId = id && /^[a-zA-Z0-9-]{1,64}$/.test(id) ? id : randomUUID();
    res.set('x-request-id', req.requestId);
    const start = Date.now();
    res.on('finish', () => console.log(JSON.stringify({
      service: 'payments', requestId: req.requestId, method: req.method,
      path: req.path, status: res.statusCode, durationMs: Date.now() - start,
    })));
    next();
  };

