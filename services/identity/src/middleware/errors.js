import { UserError } from '../users/service.js';

export function errors(error, req, res, _next) {
  let status = 500, code = 'internal_error', message = 'Não foi possível concluir a operação.';
  if (error instanceof UserError) {
    status = error.status; code = error.code; message = error.message;
  } else if (error.type === 'entity.parse.failed') {
    status = 400; code = 'invalid_json'; message = 'JSON inválido.';
  } else if (error.type === 'entity.too.large') {
    status = 413; code = 'payload_too_large'; message = 'Requisição muito grande.';
  } else if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', '57P01', '57P03', '53300', '08006', 'session_store_unavailable'].includes(error.code)
      || /timeout|connection terminated/i.test(error.message || '')) {
    status = 503; code = 'dependency_unavailable'; message = 'Serviço temporariamente indisponível.';
  }
  if (status >= 500) console.error(JSON.stringify({ service: 'identity', requestId: req.requestId, error: code }));
  res.status(status).json({ error: code, message, requestId: req.requestId });
}

