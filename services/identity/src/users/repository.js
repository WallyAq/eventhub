import { randomUUID } from 'node:crypto';

const publicColumns = `id, name, email, email_verified_at AS "emailVerifiedAt", role,
  (SELECT organization_id FROM organization_members WHERE user_id=users.id) AS "organizationId",
  cpf, phone, marketing_opt_in AS "marketingOptIn", created_at AS "createdAt", updated_at AS "updatedAt"`;

export function createUserRepository(pool) {
  return {
    async create({ name, email, passwordHash, cpf = null, phone = null, marketingOptIn = false, termsAccepted = false, organization }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO users (id,name,email,password_hash,cpf,phone,marketing_opt_in,terms_accepted_at,role) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${publicColumns}`,
          [randomUUID(),name,email,passwordHash,cpf,phone,marketingOptIn,termsAccepted ? new Date() : null,organization ? 'ORGANIZER' : 'PARTICIPANT'],
        );
        if (organization) {
          const id = randomUUID();
          await client.query('INSERT INTO organizations (id,name,description,cnpj,legal_name,entity_type,phone,email) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [id,organization.name,'',organization.cnpj,organization.legalName,organization.entityType,organization.phone,organization.email]);
          await client.query("INSERT INTO organization_members (organization_id,user_id,role) VALUES ($1,$2,'OWNER')", [id,rows[0].id]);
          rows[0].organizationId = id;
        }
        await client.query('COMMIT');
        return rows[0];
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async findCredentials(email) {
      const { rows } = await pool.query(
        `SELECT ${publicColumns}, password_hash AS "passwordHash", credentials_version AS "credentialsVersion" FROM users WHERE email = $1`, [email],
      );
      return rows[0];
    },
    async findById(id) {
      return (await pool.query(`SELECT ${publicColumns} FROM users WHERE id = $1`, [id])).rows[0];
    },
    async updateName(id, name, values = {}) {
      return (await pool.query(
        `UPDATE users SET name=$2, cpf=CASE WHEN $3 THEN $4 ELSE cpf END,phone=CASE WHEN $5 THEN $6 ELSE phone END, updated_at=now() WHERE id=$1 RETURNING ${publicColumns}`,
        [id, name, Object.hasOwn(values,'cpf'), values.cpf ?? null, Object.hasOwn(values,'phone'), values.phone ?? null],
      )).rows[0];
    },
    async changePassword(id, oldHash, newHash) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const changed = (await client.query('UPDATE users SET password_hash=$3,credentials_version=credentials_version+1,updated_at=now() WHERE id=$1 AND password_hash=$2', [id,oldHash,newHash])).rowCount === 1;
        if (changed) {
          await client.query('DELETE FROM password_resets WHERE user_id=$1', [id]);
          await client.query('DELETE FROM email_changes WHERE user_id=$1', [id]);
        }
        await client.query('COMMIT');
        return changed;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };
}

