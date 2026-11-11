import { traceHeaders, withTrace, logEvent } from './trace.js';
import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { providerPayment } from './provider.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

async function remote(service, path, authorization = '', body, requestId = '') {
  const response = await fetch(process.env[service + '_URL'] + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization, 'x-internal-key': process.env.INTERNAL_API_KEY, 'content-type': 'application/json', ...traceHeaders(), ...(requestId ? { 'x-request-id': requestId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Object.assign(new Error('Dependência indisponível ou acesso recusado.'), { status: [401,403,404,409].includes(response.status) ? response.status : 503 });
  return response.json();
}
export async function migratePayments(pool) {
  const client = await pool.connect();
  try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(45001)');
  await client.query(`CREATE TABLE IF NOT EXISTS payments (
    registration_id uuid PRIMARY KEY, user_id uuid NOT NULL, amount_cents int NOT NULL CHECK(amount_cents>0),
    status text NOT NULL CHECK(status IN ('PENDING','APPROVED','DECLINED','EXPIRED')),
    outcome text NOT NULL CHECK(outcome IN ('APPROVED','DECLINED')), created_at timestamptz NOT NULL DEFAULT now()
  )`);
  // Existing transactions retain their original decision/recovery semantics.
  await client.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_mode text NOT NULL DEFAULT 'LEGACY';
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS correlation_id varchar(64);
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_id uuid;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_status text;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz;`);
  await client.query('CREATE TABLE IF NOT EXISTS payment_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const directory = new URL('./database/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    const sql = (await readFile(new URL(name, directory), 'utf8')).replaceAll('\r\n', '\n');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const applied = (await client.query('SELECT checksum FROM payment_schema_migrations WHERE name=$1', [name])).rows[0];
    if (applied) {
      if (applied.checksum !== checksum) throw new Error('Applied migration was modified: ' + name);
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO payment_schema_migrations(name,checksum) VALUES($1,$2)', [name,checksum]);
  }
  await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
function view(row) { return { registrationId: row.registration_id, amountCents: row.amount_cents, status: row.status, createdAt: row.created_at,
  providerMode: row.provider_mode || 'LEGACY', providerPaymentId: row.provider_id || null, providerStatus: row.provider_status || null, correlationId: row.correlation_id || row.registration_id }; }

export async function reconcile(pool, id, requestId = '') {
  const row = (await pool.query('SELECT * FROM payments WHERE registration_id=$1', [id])).rows[0];
  if (!row) return row;
  return withTrace(row.correlation_id || row.registration_id, requestId, async () => {
  if (row.status !== 'PENDING') return row;
  logEvent('payment.reconciling', { registrationId: id });
  let decision = row.outcome;
  if (row.provider_mode === 'EXTERNAL_SIMULATOR') {
    const provider = await providerPayment(row, requestId);
    decision = provider.status;
    await pool.query("UPDATE payments SET provider_id=$2,provider_status=$3 WHERE registration_id=$1 AND status='PENDING'", [id,provider.id,provider.status]);
  }
  const { registration } = await remote('REGISTRATIONS', '/internal/registrations/' + id + '/payment', '', { outcome: decision }, requestId);
  const status = registration.status === 'CONFIRMED' ? 'APPROVED' : registration.status === 'EXPIRED' || decision !== 'DECLINED' ? 'EXPIRED' : 'DECLINED';
  return (await pool.query("UPDATE payments SET status=$2 WHERE registration_id=$1 AND status='PENDING' RETURNING *", [id,status])).rows[0] || (await pool.query('SELECT * FROM payments WHERE registration_id=$1',[id])).rows[0];
  });
}

export function createPaymentRouter(pool) {
  const router = Router();
  router.post('/internal/payments/query', async (req, res) => {
    const supplied = Buffer.from(req.get('x-internal-key') || ''), expected = Buffer.from(process.env.INTERNAL_API_KEY || '');
    if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return res.status(401).json({ message: 'Credencial interna inválida.' });
    const ids = req.body?.registrationIds;
    if (!req.body || Object.keys(req.body).some(key => key !== 'registrationIds') || !Array.isArray(ids) || ids.length > 500
        || ids.some(id => typeof id !== 'string' || !uuid.test(id)))
      return res.status(400).json({ message: 'Informe até 500 identificadores de inscrição válidos.' });
    const { rows } = await pool.query('SELECT * FROM payments WHERE registration_id=ANY($1::uuid[])', [ids]);
    res.set('Cache-Control', 'no-store').json({ payments: rows.map(view) });
  });
  router.use('/payments', (_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  router.get('/payments/:id', async (req,res) => {
    const { user } = await remote('IDENTITY','/users/me',req.get('authorization') || '');
    if (user.role !== 'PARTICIPANT') return res.status(403).json({ message: 'Esta operação exige uma conta de participante.' });
    if (!uuid.test(req.params.id)) return res.status(400).json({ message:'Identificador inválido.' });
    const row=(await pool.query('SELECT * FROM payments WHERE registration_id=$1 AND user_id=$2',[req.params.id,user.id])).rows[0];
    if (!row) return res.json({ payment:null });
    res.set('x-correlation-id', row.correlation_id || row.registration_id);
    try { res.json({payment:view(await reconcile(pool,row.registration_id,req.requestId))}); }
    catch { res.status(202).json({payment:view(row),message:'O provedor ou a confirmação está temporariamente indisponível. A mesma transação será retomada.'}); }
  });
  router.post('/payments/:id',async (req,res) => {
    const authorization=req.get('authorization') || '';
    const { user }=await remote('IDENTITY','/users/me',authorization);
    if (user.role !== 'PARTICIPANT') return res.status(403).json({ message: 'Esta operação exige uma conta de participante.' });
    if (!uuid.test(req.params.id) || !req.body || Object.keys(req.body).some(key=>key!=='outcome') || !['APPROVED','DECLINED','EXPIRED'].includes(req.body.outcome)) return res.status(400).json({message:'Selecione aprovação, recusa ou expiração simulada.'});
    const {registration}=await remote('REGISTRATIONS','/registrations/'+req.params.id,authorization);
    if (registration.userId !== user.id) return res.status(404).json({message:'Inscrição não encontrada.'});
    let row=(await pool.query('SELECT * FROM payments WHERE registration_id=$1',[req.params.id])).rows[0];
    if (!row) {
      if (registration.status!=='PENDING_PAYMENT' || registration.priceCents<=0) return res.status(409).json({message:'Reserva não está disponível para pagamento.'});
      row=(await pool.query(`INSERT INTO payments(registration_id,user_id,amount_cents,status,outcome,provider_mode,reservation_expires_at,correlation_id)
        VALUES($1,$2,$3,'PENDING',$4,'EXTERNAL_SIMULATOR',$5,$6) ON CONFLICT DO NOTHING RETURNING *`,[req.params.id,user.id,registration.priceCents,req.body.outcome,registration.expiresAt,registration.correlationId || registration.id])).rows[0]
        || (await pool.query('SELECT * FROM payments WHERE registration_id=$1',[req.params.id])).rows[0];
    }
    if(row.outcome!==req.body.outcome) return res.status(409).json({message:'Esta transação já recebeu outro resultado. Consulte seu estado.'});
    res.set('x-correlation-id', row.correlation_id || row.registration_id);
    try { row=await reconcile(pool,req.params.id,req.requestId); }
    catch { return res.status(202).json({payment:view(row),message:'Resultado registrado. A confirmação será retomada automaticamente.'}); }
    res.json({payment:view(row)});
  });
  return router;
}

export function startReconciliation(pool) {
  let busy=false;
  const timer=setInterval(async()=>{
    if(busy)return; busy=true;
    try { for(const row of (await pool.query("SELECT registration_id,correlation_id FROM payments WHERE status='PENDING' ORDER BY created_at LIMIT 100")).rows) {
      try { await reconcile(pool,row.registration_id); } catch { console.log(JSON.stringify({service:'payments',worker:'reconciliation',status:'retry',registrationId:row.registration_id,correlationId:row.correlation_id || row.registration_id})); }
    } }
    catch { console.log(JSON.stringify({service:'payments',worker:'reconciliation',status:'retry'})); }
    finally { busy=false; }
  },3000);
  timer.unref(); return timer;
}
