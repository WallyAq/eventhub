import { createHash } from 'node:crypto';

export const tokenHash = token => createHash('sha256').update(token).digest('hex');

export function createSessions(pool) {
  return {
    async isValid(token, claims) {
      const { rows } = await pool.query(`SELECT credentials_version AS version,
        EXISTS(SELECT 1 FROM revoked_sessions WHERE token_hash=$2 AND expires_at>now()) AS revoked
        FROM users WHERE id=$1`, [claims.sub, tokenHash(token)]);
      return !!rows[0] && rows[0].version === (claims.sv ?? 0) && !rows[0].revoked;
    },
    async revoke(token, claims) {
      await pool.query(`INSERT INTO revoked_sessions(token_hash,user_id,expires_at) VALUES($1,$2,to_timestamp($3))
        ON CONFLICT DO NOTHING`, [tokenHash(token), claims.sub, claims.exp]);
      await pool.query('DELETE FROM revoked_sessions WHERE expires_at<=now()');
    },
  };
}
