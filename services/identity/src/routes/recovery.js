import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../security/passwords.js';
import { createMailDelivery, recoveryMessage } from '../mail/delivery.js';
import { createMailOutbox } from '../mail/outbox.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
export function createRecoveryRouter(pool, { mailOutbox = createMailOutbox(pool, createMailDelivery()), env = process.env } = {}) {
  const router=Router();
  const limit=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false});
  router.use('/auth/password',limit,(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.post('/auth/password/forgot',async(req,res)=>{
    const email=typeof req.body?.email==='string' ? req.body.email.trim().toLowerCase() : '';
    if(Object.keys(req.body || {}).some(key=>key!=='email') || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({message:'Informe um e-mail válido.'});
    const token=randomBytes(32).toString('hex');
    const {rows}=await pool.query('SELECT id FROM users WHERE email=$1',[email]);
    if(rows[0]) {
      const id = randomUUID(), message = recoveryMessage({ id, email, token }, env), client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM password_resets WHERE expires_at<=now()');
        await client.query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[hash(token),rows[0].id]);
        await mailOutbox.enqueue(client, message);
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      // Mailbox stays immediately available to the academic demo. SMTP runs in
      // the durable worker so provider latency/errors do not reveal accounts.
      if ((env.MAIL_MODE || 'mailbox') === 'mailbox') {
        try { await mailOutbox.flush(id); } catch { /* durable worker retries */ }
      }
    }
    res.status(202).json({message:'Se o e-mail estiver cadastrado, enviaremos um link de recuperação. Ele é válido por 30 minutos.'});
  });
  router.post('/auth/password/reset',async(req,res)=>{
    const {token,password}=req.body || {};
    if(Object.keys(req.body || {}).some(key=>!['token','password'].includes(key)) || !/^[a-f0-9]{64}$/.test(token || '') || typeof password!=='string' || password.length<8 || password.length>128) return res.status(400).json({message:'Informe link válido e senha entre 8 e 128 caracteres.'});
    const passwordHash=await hashPassword(password), client=await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock the user first, as authenticated password changes do. Two valid
      // reset links must not deadlock by each locking a different token first.
      const {rows}=await client.query(`SELECT id AS user_id FROM users WHERE id=(SELECT user_id FROM password_resets
        WHERE token_hash=$1 AND expires_at>clock_timestamp()) FOR UPDATE`,[hash(token)]);
      if(!rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({message:'Link inválido, expirado ou já utilizado.'}); }
      const consumed = await client.query('DELETE FROM password_resets WHERE token_hash=$1 AND expires_at>clock_timestamp() RETURNING user_id', [hash(token)]);
      if (!consumed.rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({message:'Link inválido, expirado ou já utilizado.'}); }
      await client.query('UPDATE users SET password_hash=$2,credentials_version=credentials_version+1,updated_at=now() WHERE id=$1',[rows[0].user_id,passwordHash]);
      await client.query('DELETE FROM password_resets WHERE user_id=$1',[rows[0].user_id]);
      await client.query('DELETE FROM email_changes WHERE user_id=$1',[rows[0].user_id]);
      await client.query('COMMIT');
      res.json({message:'Senha redefinida. Faça login com a nova senha.'});
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  });
  return router;
}
