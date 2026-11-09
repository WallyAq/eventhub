import { traces, validId } from '../trace.js';

export function createMailOutbox(pool, delivery) {
  let running = false;
  return {
    async enqueue(client, message) {
      const context = traces.getStore() || { correlationId: message.id, requestId: message.id };
      await client.query('INSERT INTO mail_outbox(id,payload) VALUES($1,$2::jsonb)', [message.id, JSON.stringify({ ...message, ...context })]);
    },
    async flush(id = null) {
      // A worker and an HTTP request may race; the row lock makes delivery exclusive.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT id,payload,attempts FROM mail_outbox
          WHERE status='PENDING' AND next_attempt_at<=now() AND ($1::uuid IS NULL OR id=$1)
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`, [id]);
        if (rows[0]) {
          const row = rows[0];
          const context = { correlationId: validId(row.payload.correlationId) ? row.payload.correlationId : row.id,
            requestId: validId(row.payload.requestId) ? row.payload.requestId : row.id };
          try {
            await delivery.send(row.payload);
            await client.query(`UPDATE mail_outbox SET status='SENT',attempts=attempts+1,
              payload=payload-'text'-'path',updated_at=now() WHERE id=$1`, [row.id]);
            console.log(JSON.stringify({ service: 'identity', event: 'mail.sent', messageId: row.id, ...context }));
          } catch {
            // Persist failure before retrying; never mark a failed SMTP call SENT.
            await client.query(`UPDATE mail_outbox SET attempts=attempts+1,status=CASE WHEN attempts+1>=3 THEN 'FAILED' ELSE 'PENDING' END,
              next_attempt_at=now()+interval '5 seconds'*(attempts+1),updated_at=now() WHERE id=$1`, [row.id]);
            console.log(JSON.stringify({ service: 'identity', event: 'mail.failed', messageId: row.id, ...context }));
          }
        }
        await client.query('COMMIT');
        return !!rows[0];
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    start() {
      const timer = setInterval(async () => {
        if (running) return;
        running = true;
        try { await this.flush(); }
        catch { console.error(JSON.stringify({ service: 'identity', worker: 'mail', error: 'delivery_unavailable' })); }
        finally { running = false; }
      }, 3000);
      timer.unref();
      return () => clearInterval(timer);
    },
  };
}
