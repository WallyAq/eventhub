import pg from 'pg';

export function createPool() {
  if (!process.env.PGHOST || !process.env.PGPASSWORD) throw new Error('Database configuration is required');
  const pool = new pg.Pool({ connectionTimeoutMillis: 2000, query_timeout: 2000, max: 5 });
  pool.on('error', () => console.error(JSON.stringify({ service: 'payments', error: 'database_connection_error' })));
  return pool;
}

