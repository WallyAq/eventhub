import { createPool } from './database/pool.js';
import { createApp } from './app.js';
import { migratePayments, startReconciliation } from './payments.js';

const pool = createPool();
await migratePayments(pool);
const worker = startReconciliation(pool);
const server = createApp(pool).listen(Number(process.env.PORT || 3000), '0.0.0.0');
async function shutdown() {
  clearInterval(worker);
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

