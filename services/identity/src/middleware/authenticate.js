export function authenticate(tokens) {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/.exec(req.get('authorization') || '');
    try {
      if (!match) throw new Error('Missing token');
      req.identity = await tokens.verify(match[1]);
      next();
    } catch {
      res.status(401).json({ error: 'invalid_token', message: 'Faça login para continuar.', requestId: req.requestId });
    }
  };
}

