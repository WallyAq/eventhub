import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { verifyPassword } from '../security/passwords.js';
import { UserError } from './service.js';
import { emailChangeMessage } from '../mail/delivery.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const invalidLink = () => new UserError(400, 'invalid_email_token', 'Link inválido, expirado ou já utilizado.');

function input(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)))
    throw new UserError(400, 'invalid_input', 'Campos inválidos.');
}

export function createEmailService(pool, { mailOutbox, env = process.env }) {
  return {
    async request(userId, body) {
      input(body, ['email', 'currentPassword']);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          || typeof body.currentPassword !== 'string' || body.currentPassword.length < 8 || body.currentPassword.length > 128)
        throw new UserError(400, 'invalid_input', 'Informe um e-mail válido e sua senha atual.');
      const { rows } = await pool.query('SELECT password_hash,credentials_version,email FROM users WHERE id=$1', [userId]);
      const user = rows[0];
      if (!user) throw new UserError(401, 'invalid_token', 'Sessão inválida.');
      if (!(await verifyPassword(body.currentPassword, user.password_hash)))
        throw new UserError(400, 'invalid_password', 'Senha atual incorreta.');
      const token = randomBytes(32).toString('hex'), id = randomUUID();
      const message = emailChangeMessage({ id, email, token }, env), client = await pool.connect();
      try {
        await client.query('BEGIN');
        const current = (await client.query('SELECT credentials_version,password_hash FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
        if (!current || current.credentials_version !== user.credentials_version || current.password_hash !== user.password_hash)
          throw new UserError(409, 'credentials_changed', 'Os dados de acesso foram alterados. Entre novamente.');
        const occupied = (await client.query('SELECT id FROM users WHERE email=$1 AND id<>$2', [email, userId])).rows[0];
        if (occupied) throw new UserError(409, 'email_in_use', 'Este e-mail já está cadastrado.');
        await client.query('DELETE FROM email_changes WHERE expires_at<=now()');
        await client.query(`INSERT INTO email_changes(token_hash,user_id,new_email,credentials_version,expires_at)
          VALUES($1,$2,$3,$4,now()+interval '30 minutes') ON CONFLICT(user_id) DO UPDATE
          SET token_hash=EXCLUDED.token_hash,new_email=EXCLUDED.new_email,credentials_version=EXCLUDED.credentials_version,
          expires_at=EXCLUDED.expires_at,created_at=now()`, [hash(token), userId, email, user.credentials_version]);
        await mailOutbox.enqueue(client, message);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      if ((env.MAIL_MODE || 'mailbox') === 'mailbox') {
        try { await mailOutbox.flush(id); } catch { /* durable worker retries */ }
      }
    },
    async confirm(body) {
      input(body, ['token']);
      if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) throw invalidLink();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Same user-first lock ordering as password changes and resets.
        const user = (await client.query(`SELECT id,credentials_version FROM users WHERE id=(SELECT user_id FROM email_changes
          WHERE token_hash=$1 AND expires_at>clock_timestamp()) FOR UPDATE`, [hash(body.token)])).rows[0];
        if (!user) throw invalidLink();
        const pending = (await client.query(`DELETE FROM email_changes WHERE token_hash=$1 AND expires_at>clock_timestamp()
          AND credentials_version=$2 RETURNING new_email`, [hash(body.token), user.credentials_version])).rows[0];
        if (!pending) throw invalidLink();
        await client.query('UPDATE users SET email=$2,email_verified_at=now(),credentials_version=credentials_version+1,updated_at=now() WHERE id=$1', [user.id, pending.new_email]);
        await client.query('DELETE FROM password_resets WHERE user_id=$1', [user.id]);
        await client.query('DELETE FROM email_changes WHERE user_id=$1', [user.id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') throw new UserError(409, 'email_in_use', 'Este e-mail já está cadastrado. Solicite outro endereço.');
        throw error;
      } finally { client.release(); }
    },
  };
}
