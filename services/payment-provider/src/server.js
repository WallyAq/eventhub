import pg from 'pg';
import { createApp, migrate } from './app.js';

if (!process.env.PAYMENT_PROVIDER_API_KEY) throw new Error('Configure a credencial do provedor simulado.');
const pool = new pg.Pool({ connectionTimeoutMillis: 3000, query_timeout: 5000, max: 5 });
pool.on('error', () => console.error(JSON.stringify({ service: 'payment-provider-simulator', error: 'database_unavailable' })));
await migrate(pool);
const server = createApp(pool).listen(3000, '0.0.0.0');
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(async () => { await pool.end(); process.exit(0); }));
