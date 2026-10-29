import pg from 'pg';
import { createApp } from './app.js';

if (!process.env.PGHOST || !process.env.PGPASSWORD) throw new Error('Database configuration is required');
const pool = new pg.Pool({ connectionTimeoutMillis: 2000, query_timeout: 2000, max: 5 });
pool.on('error', () => console.error(JSON.stringify({ service: 'payments', error: 'database_connection_error' })));
const server = createApp(pool).listen(Number(process.env.PORT || 3000), '0.0.0.0');
async function shutdown() {
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

