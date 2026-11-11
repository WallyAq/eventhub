import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './pool.js';

export async function accessPreflight(pool) {
  // No names, e-mails, credentials or mutations in this report.
  const { rows } = await pool.query(`SELECT u.id AS "userId",u.role,
    count(m.user_id)::integer AS "institutionCount",
    COALESCE(jsonb_agg(m.organization_id ORDER BY m.organization_id) FILTER(WHERE m.user_id IS NOT NULL),'[]') AS "institutionIds"
    FROM users u LEFT JOIN organization_members m ON m.user_id=u.id GROUP BY u.id,u.role
    HAVING count(m.user_id)>1 OR (u.role='PARTICIPANT' AND count(m.user_id)>0)
      OR (u.role='ORGANIZER' AND count(m.user_id)<>1) OR u.role NOT IN ('PARTICIPANT','ORGANIZER') ORDER BY u.id`);
  return { service: 'identity', compatible: rows.length === 0, conflicts: rows };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = createPool();
  try { console.log(JSON.stringify(await accessPreflight(pool), null, 2)); }
  finally { await pool.end(); }
}
