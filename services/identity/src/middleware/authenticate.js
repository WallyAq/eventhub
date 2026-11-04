export function authenticate(tokens) {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/.exec(req.get('authorization') || '');
    try {
      if (!match) throw new Error('Missing token');
      req.identity = await tokens.verify(match[1]);
      req.accessToken = match[1];
      next();
    } catch (error) {
      if (error.code === 'session_store_unavailable') return res.status(503).json({ error: 'dependency_unavailable', message: 'Serviço temporariamente indisponível.', requestId: req.requestId });
      res.status(401).json({ error: 'invalid_token', message: 'Faça login para continuar.', requestId: req.requestId });
    }
  };
}

