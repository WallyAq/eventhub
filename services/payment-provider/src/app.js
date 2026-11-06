import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function migrate(pool) {
  await pool.query(`SELECT pg_advisory_xact_lock(49001); CREATE TABLE IF NOT EXISTS provider_transactions (
    id uuid PRIMARY KEY, reference uuid NOT NULL UNIQUE, amount_cents int NOT NULL CHECK(amount_cents>0),
    currency text NOT NULL CHECK(currency='BRL'), requested_outcome text NOT NULL CHECK(requested_outcome IN ('APPROVED','DECLINED','EXPIRED')),
    status text NOT NULL CHECK(status IN ('APPROVED','DECLINED','EXPIRED')), expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now());`);
}
export function view(row) {
  return { id: row.id, reference: row.reference, amountCents: row.amount_cents, currency: row.currency,
    status: row.status, expiresAt: new Date(row.expires_at).toISOString(), createdAt: row.created_at, simulated: true };
}
export function createApp(pool, apiKey = process.env.PAYMENT_PROVIDER_API_KEY || '') {
  const app = express(); app.disable('x-powered-by');
  app.use((req, res, next) => {
    const incoming = req.get('x-request-id') || '', requestId = /^[a-zA-Z0-9-]{1,64}$/.test(incoming) ? incoming : randomUUID(), start = Date.now();
    res.set('x-request-id', requestId);
    res.on('finish', () => console.log(JSON.stringify({ service: 'payment-provider-simulator', requestId,
      method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - start })));
    next();
  });
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/health', (_req, res) => res.json({ service: 'payment-provider-simulator', status: 'ok' }));
  app.get('/ready', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ status: 'ready' }); } catch { res.status(503).json({ status: 'unavailable' }); } });
  app.use('/v1', (req, res, next) => {
    const value = Buffer.from((req.get('authorization') || '').replace(/^Bearer /, '')), expected = Buffer.from(apiKey);
    if (!expected.length || value.length !== expected.length || !timingSafeEqual(value, expected)) return res.status(401).json({ error: 'invalid_provider_key' });
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.post('/v1/payments', async (req, res) => {
    const b = req.body;
    if (!b || Object.keys(b).some(k => !['reference','amountCents','currency','expiresAt','simulation'].includes(k)) ||
        !uuid.test(b.reference || '') || req.get('idempotency-key') !== b.reference || !Number.isSafeInteger(b.amountCents) || b.amountCents < 1 || b.amountCents > 10000000 ||
        b.currency !== 'BRL' || typeof b.expiresAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(b.expiresAt) || !Number.isFinite(Date.parse(b.expiresAt)) ||
        !b.simulation || Object.keys(b.simulation).some(k => k !== 'outcome') || !['APPROVED','DECLINED','EXPIRED'].includes(b.simulation.outcome))
      return res.status(422).json({ error: 'invalid_payment' });
    const row = (await pool.query(`INSERT INTO provider_transactions(id,reference,amount_cents,currency,requested_outcome,status,expires_at)
      VALUES($1,$2,$3,$4,$5,CASE WHEN $6::timestamptz<=clock_timestamp() THEN 'EXPIRED' ELSE $5 END,$6)
      ON CONFLICT(reference) DO NOTHING RETURNING *`, [randomUUID(), b.reference, b.amountCents, b.currency, b.simulation.outcome, b.expiresAt])).rows[0];
    const result = row || (await pool.query('SELECT * FROM provider_transactions WHERE reference=$1', [b.reference])).rows[0];
    if (result.amount_cents !== b.amountCents || result.currency !== b.currency || result.requested_outcome !== b.simulation.outcome || new Date(result.expires_at).getTime() !== Date.parse(b.expiresAt))
      return res.status(409).json({ error: 'idempotency_conflict' });
    res.status(row ? 201 : 200).json({ payment: view(result) });
  });
  app.get('/v1/payments/:id', async (req, res) => {
    if (!uuid.test(req.params.id)) return res.status(422).json({ error: 'invalid_id' });
    const row = (await pool.query('SELECT * FROM provider_transactions WHERE id=$1', [req.params.id])).rows[0];
    if (!row) return res.status(404).json({ error: 'payment_not_found' });
    res.json({ payment: view(row) });
  });
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((error, _req, res, _next) => res.status(error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 503).json({ error: 'provider_unavailable_or_invalid_request' }));
  return app;
}
